import { basename } from 'node:path';
import type { Readable } from 'node:stream';
import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { UnpacksContent } from '@app/plugin-sdk';
import { MediaType, type ContentHash } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { BlobStore, ContentTooLargeError } from '../../storage/contracts.js';
import { isNoise, memberPath } from '../domain/member-path.js';
import { LIMITS, TreeBudget } from '../domain/tree-budget.js';
import {
  isCurrent,
  kept,
  UnpackingRepository,
  type LeftOut,
  type Member,
  type Unpacking,
  type UnpackingKey,
} from '../domain/unpacking.js';
import { Dispatch } from './dispatch.js';
import type { UnpackJob } from './plugin-job.js';
import { takenName, withStreams } from './plugin-run.js';
import { FileFacts, PluginJobQueue, type FileFact } from './ports.js';

// past this a walk is aborted, and the job fails as a processor's does
const WALK_MS = 10 * 60_000;

// the store failed, not the container: the job's to retry
class StoreFailed extends Error {}

// a container to open, at its place in the walk
interface Node extends FileFact {
  hash: ContentHash;
  // its path in the root, null for the root
  within: string | null;
  depth: number;
  unpacker: UnpacksContent;
  matched: string;
}

// Lists a container a file holds, the containers in it too, in one walk
// under one TreeBudget: stores each member it keeps as a content of its
// own, saves the tree, then queues the processing of each member kept by its
// file name. A member's path is made safe or it's left out unlisted, as is
// noise (member-path.ts). The tree is the root's; a container in it is
// opened from its stored bytes by whichever unpacker takes it, once a walk.
@Injectable()
export class UnpackContent implements OnApplicationShutdown {
  private readonly logger = new Logger(UnpackContent.name);
  private readonly stopping = new AbortController();

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly files: FileFacts,
    private readonly blobs: BlobStore,
    private readonly unpackings: UnpackingRepository,
    private readonly dispatch: Dispatch,
    private readonly queue: PluginJobQueue,
  ) {}

  onApplicationShutdown() {
    this.stopping.abort();
  }

  async run({ key: { hash, unpacker: name } }: UnpackJob) {
    const unpacker = this.plugins.unpacker(name);
    // turned off since the job was queued
    if (!unpacker) return;
    const { spec, instance } = unpacker;
    // queued before a deploy brought another version or limits: the
    // running ones do it
    const key = { hash, unpacker: name, version: spec.version };
    const root = takenName(await this.files.holding(hash), (f) =>
      spec.match(f),
    );
    // removed since, or renamed to what the unpacker doesn't take
    if (!root) return;
    const current = await this.unpackings.current(hash);
    let tree = current;
    if (!current || !isCurrent(current, key, LIMITS.policy)) {
      tree = await this.walk(key, { ...root, unpacker: instance });
      // after its members' blobs, so a tree never names one not stored
      await this.unpackings.save(tree);
      this.logger.log(
        `${name}: ${root.name}, ${tree.members.length} members${tree.cutShort ? `, cut short: ${tree.cutShort}` : ''}`,
      );
    }
    // queued again in case a try before saved it and failed to (deduplicated)
    await this.queue.enqueue(
      kept(tree!.members).flatMap(({ path, mime, hash }) =>
        this.dispatch.processing({ name: basename(path), mime, hash }),
      ),
    );
  }

  private async walk(
    key: UnpackingKey,
    root: FileFact & { matched: string; unpacker: UnpacksContent },
  ): Promise<Unpacking> {
    const budget = new TreeBudget(this.blobs.maxBytes);
    const signal = AbortSignal.any([
      AbortSignal.timeout(WALK_MS),
      this.stopping.signal,
    ]);
    const members: Member[] = [];
    const paths = new Set<string>();
    const opened = new Set([key.hash]);
    const nodes: Node[] = [{ ...root, hash: key.hash, within: null, depth: 0 }];
    // the first reason, the walk going on with the containers queued
    let cutShort: string | null = null;
    for (let node = nodes.shift(); node; node = nodes.shift()) {
      try {
        await withStreams(this.blobs, node.hash, async (content) => {
          const stored = () =>
            content().catch((err: unknown) => {
              throw new StoreFailed('container not read', { cause: err });
            });
          for await (const found of node.unpacker.unpack({
            name: node.name,
            mime: node.mime,
            matched: node.matched,
            hash: node.hash,
            content: stored,
            signal,
          })) {
            signal.throwIfAborted();
            if (budget.full) {
              found.content.destroy();
              cutShort ??= `past ${LIMITS.members} members`;
              return;
            }
            const path = memberPath(node.within, found.path);
            if (path === null || isNoise(path)) {
              found.content.destroy();
              continue;
            }
            const mime = MediaType.safeParse(found.mime).data ?? null;
            const listed = (leftOut: LeftOut) => {
              found.content.destroy();
              members.push({
                path,
                hash: null,
                size: found.size ?? null,
                mime,
                leftOut,
              });
            };
            const limit = budget.admit(found.size ?? null);
            const inner = this.plugins.unpackerFor({
              name: basename(path),
              mime,
            });
            if (typeof limit === 'string') listed(limit);
            else if (paths.has(path)) listed('DUPLICATE_PATH');
            else if (inner && !budget.opens(node.depth + 1)) listed('TOO_DEEP');
            else {
              const put = await this.store(found.content, limit);
              if (!put) listed(budget.past(limit));
              else {
                budget.spent(put.size);
                members.push({ path, ...put, mime, leftOut: null });
                if (inner && !opened.has(put.hash)) {
                  opened.add(put.hash);
                  nodes.push({
                    name: basename(path),
                    mime,
                    hash: put.hash,
                    within: path,
                    depth: node.depth + 1,
                    unpacker: inner.unpacker.instance,
                    matched: inner.matched,
                  });
                }
              }
            }
            paths.add(path);
          }
        });
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        if (err instanceof StoreFailed) throw err.cause;
        // the container's or its unpacker's: what was listed stays
        cutShort ??= `${node.within ?? 'the container'}: ${(err as Error).message}`;
      }
    }
    return { ...key, policy: LIMITS.policy, members, cutShort };
  }

  // A member's bytes, null past the limit. Its own stream failing is the
  // container's fault, the store failing the store's.
  private async store(content: Readable, limit: number) {
    let broken: unknown;
    content.once('error', (err) => (broken = err));
    try {
      return await this.blobs.put(content, limit);
    } catch (err) {
      if (err instanceof ContentTooLargeError) return null;
      if (broken !== undefined) throw broken;
      throw new StoreFailed('member not stored', { cause: err });
    }
  }
}
