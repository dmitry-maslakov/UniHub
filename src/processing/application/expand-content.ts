import { Injectable, Logger } from '@nestjs/common';
import type { ExpandsContent } from '@app/plugin-sdk';
import { PluginCatalog } from '../../plugins/contracts.js';
import { BlobStore, ContentTooLargeError } from '../../storage/contracts.js';
import {
  ExpansionRepository,
  MAX_DEPTH,
  Stored,
  type Entry,
  type ExpansionKey,
} from '../domain/expansion.js';
import { ContentNames, type KnownName } from './content-names.js';
import { takenName, withStreams } from './plugin-run.js';
import { Dispatch } from './dispatch.js';
import type { ExpandJob } from './plugin-job.js';
import { PluginJobQueue } from './ports.js';

// Runs one expander on some content: stores each entry it yields, as Stored
// lets it, as a content of its own, then the expansion, then queues each
// entry's jobs by its path, one deeper. Worth doing while the content goes
// by a name the expander takes, less than MAX_DEPTH deep.
@Injectable()
export class ExpandContent {
  private readonly logger = new Logger(ExpandContent.name);

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly names: ContentNames,
    private readonly blobs: BlobStore,
    private readonly expansions: ExpansionRepository,
    private readonly dispatch: Dispatch,
    private readonly queue: PluginJobQueue,
  ) {}

  async run({ key: { hash, expander: name } }: ExpandJob) {
    const expander = this.plugins.expander(name);
    // turned off since the job was queued
    if (!expander) return;
    const { spec, instance } = expander;
    // queued before a deploy brought another version: the running one does it
    const key = { hash, expander: name, version: spec.version };
    const shallow = (await this.names.holding(hash, MAX_DEPTH - 1))
      // the nearest first
      .toSorted((a, b) => a.depth - b.depth);
    const named = takenName(shallow, (n) => spec.match(n));
    // removed since, renamed to what the expander doesn't take, or too deep
    if (!named) return;
    // a try before may have saved it and failed to queue its entries'
    // jobs, which are deduplicated
    const entries =
      (await this.expansions.find(key))?.entries ??
      (await this.expand(key, instance, named));
    await this.queue.enqueue(
      entries.flatMap(({ path, hash }) =>
        this.dispatch.jobs({
          name: path,
          mime: null,
          hash,
          depth: named.depth + 1,
        }),
      ),
    );
  }

  private async expand(
    key: ExpansionKey,
    instance: ExpandsContent,
    { name, mime, matched }: KnownName & { matched: string },
  ) {
    const stored = new Stored(this.blobs.maxBytes);
    const entries: Entry[] = [];
    await withStreams(this.blobs, key.hash, async (content) => {
      for await (const entry of instance.expand({
        name,
        mime,
        matched,
        hash: key.hash,
        content,
      })) {
        if (!stored.open) break;
        if (!stored.fits(entry.size)) continue;
        // past what storage keeps of one content, its size not known before
        const put = await this.blobs
          .put(await entry.content())
          .catch((err: unknown) => {
            if (err instanceof ContentTooLargeError) return null;
            throw err;
          });
        if (!put) continue;
        stored.add(put.size);
        entries.push({ path: entry.path, ...put });
      }
    });
    await this.expansions.save({ ...key, entries });
    this.logger.log(`${key.expander}: ${name}, ${entries.length} entries`);
    return entries;
  }
}
