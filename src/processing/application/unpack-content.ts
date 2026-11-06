import { basename } from 'node:path';
import { addAbortSignal, type Readable } from 'node:stream';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { UnpacksContent } from '@app/plugin-sdk';
import { MediaType, type ContentHash } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { BlobStore, ContentTooLargeError } from '../../storage/contracts.js';
import { isNoise, memberPath } from '../domain/member-path.js';
import { treeKey } from '../domain/records.js';
import { LIMITS, TreeBudget } from '../domain/tree-budget.js';
import {
  cutShortBy,
  declaredSize,
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
import {
  FileFacts,
  PluginJobQueue,
  TextIndexQueue,
  type FileFact,
} from './ports.js';

// past this a walk is aborted, and the job fails as a processor's does
const WALK_MS = 10 * 60_000;

// The store failing, not the container, whichever stream its error reaches
// (a pipeline destroys the member with it): the file system's errors are
// Node's system errors, with a syscall. The job retries.
const isStores = (err: unknown) => err instanceof Error && 'syscall' in err;

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
// file name, and with search on its members' paths for the index. A
// member's path is made safe or it's left out unlisted, as is noise
// (member-path.ts). The tree is the root's; a container in it is opened
// from its stored bytes by whichever unpacker takes it, once a walk.
@Injectable()
export class UnpackContent {
  private readonly logger = new Logger(UnpackContent.name);

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly files: FileFacts,
    private readonly blobs: BlobStore,
    private readonly unpackings: UnpackingRepository,
    private readonly dispatch: Dispatch,
    private readonly queue: PluginJobQueue,
    // none when search is off
    @Optional() private readonly textIndex?: TextIndexQueue,
  ) {}

  // the signal stops the walk, at shutdown; the job goes back to wait then
  async run(
    { key: { hash, unpacker: name } }: UnpackJob,
    signal?: AbortSignal,
  ) {
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
      const timeout = AbortSignal.timeout(WALK_MS);
      tree = await this.walk(
        key,
        { ...root, unpacker: instance },
        signal ? AbortSignal.any([timeout, signal]) : timeout,
      );
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
    const record = treeKey(tree!);
    await this.textIndex?.enqueueRecord(record, record.fingerprint);
  }

  private async walk(
    key: UnpackingKey,
    root: FileFact & { matched: string; unpacker: UnpacksContent },
    signal: AbortSignal,
  ): Promise<Unpacking> {
    const budget = new TreeBudget(this.blobs.maxBytes);
    const members: Member[] = [];
    const paths = new Set<string>();
    const opened = new Set([key.hash]);
    const nodes: Node[] = [{ ...root, hash: key.hash, within: null, depth: 0 }];
    // the first reason, the walk going on with the containers queued
    let cutShort: string | null = null;
    for (let node = nodes.shift(); node; node = nodes.shift()) {
      if (budget.full) {
        cutShort ??= `past ${LIMITS.members} members`;
        break;
      }
      try {
        await withStreams(this.blobs, node.hash, async (content) => {
          for await (const found of node.unpacker.unpack({
            name: node.name,
            mime: node.mime,
            matched: node.matched,
            hash: node.hash,
            content,
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
            const size = declaredSize(found.size);
            const mime = MediaType.safeParse(found.mime).data ?? null;
            const listed = (leftOut: LeftOut) => {
              found.content.destroy();
              members.push({ path, hash: null, size, mime, leftOut });
            };
            const limit = budget.list(size);
            const inner = this.plugins.unpackerFor({
              name: basename(path),
              mime,
            });
            if (typeof limit === 'string') listed(limit);
            else if (paths.has(path)) listed('DUPLICATE_PATH');
            else if (inner && !budget.opens(node.depth + 1)) listed('TOO_DEEP');
            else {
              const put = await this.store(found.content, limit, signal);
              // what it took to find it out, written and thrown away
              budget.spent(put?.size ?? limit);
              if (!put) listed(budget.past(limit));
              else {
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
        if (isStores(err)) throw err;
        // the container's or its unpacker's: what was listed stays
        cutShort ??= cutShortBy(node.within ?? 'the container', err);
      }
    }
    return { ...key, policy: LIMITS.policy, members, cutShort };
  }

  // a member's bytes, null past the limit; the signal stops a stream that
  // stalls, whoever's it is
  private async store(content: Readable, limit: number, signal: AbortSignal) {
    try {
      return await this.blobs.put(addAbortSignal(signal, content), limit);
    } catch (err) {
      if (err instanceof ContentTooLargeError) return null;
      throw err;
    }
  }
}
