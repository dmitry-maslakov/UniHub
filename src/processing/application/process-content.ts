import { Injectable, Logger, Optional } from '@nestjs/common';
import { PluginCatalog } from '../../plugins/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import {
  representation,
  RepresentationRepository,
} from '../domain/representation.js';
import { Holders } from './holders.js';
import { takenName, withStreams } from './plugin-run.js';
import type { ProcessJob } from './plugin-job.js';
import { TextIndexQueue } from './ports.js';

// Runs one processor on some content and stores what it made. What's stored
// is the content's, whichever file or container member holds it, so it's
// worth making while one that a live file holds does and the processor still
// takes it. With search on, the text then goes to the search index.
@Injectable()
export class ProcessContent {
  private readonly logger = new Logger(ProcessContent.name);

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly holders: Holders,
    private readonly blobs: BlobStore,
    private readonly representations: RepresentationRepository,
    // none when search is off
    @Optional() private readonly textIndex?: TextIndexQueue,
  ) {}

  async run({ key: { hash, processor: name } }: ProcessJob) {
    const processor = this.plugins.processor(name);
    // turned off since the job was queued
    if (!processor) return;
    const { spec, instance } = processor;
    // queued before a deploy brought another version: the running one does it
    const key = { hash, processor: name, version: spec.version };
    // the same content in another file, or queued twice; queued for the
    // index again in case a try before saved it and failed to (deduplicated)
    if (await this.representations.exists(key))
      return this.textIndex?.enqueue(key);
    const file = takenName(await this.holders.of(hash), (f) => spec.match(f));
    // replaced or removed since, or renamed to what the processor doesn't take
    if (!file) return;

    const { parts } = await withStreams(this.blobs, hash, (content) =>
      instance.process({ ...file, hash, content }),
    );
    await this.representations.save(representation(key, parts));
    await this.textIndex?.enqueue(key);
    this.logger.log(`${name}: ${file.name}, ${parts.length} parts`);
  }
}
