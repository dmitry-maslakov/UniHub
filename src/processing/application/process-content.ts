import type { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import type { ContentHash } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { RepresentationRepository } from '../domain/representation.js';
import type { ProcessJob } from './plugin-job.js';
import { FileFacts, type FileFact } from './ports.js';

// Runs one processor on some content and stores what it made. What's stored
// is the content's, whichever file holds it, so it's worth making while
// some file that isn't removed holds it and the processor still takes that
// file.
@Injectable()
export class ProcessContent {
  private readonly logger = new Logger(ProcessContent.name);

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly files: FileFacts,
    private readonly blobs: BlobStore,
    private readonly representations: RepresentationRepository,
  ) {}

  async run({ key: { hash, processor: name } }: ProcessJob) {
    const processor = this.plugins.processor(name);
    // turned off since the job was queued
    if (!processor) return;
    const { spec, instance } = processor;
    // queued before a deploy brought another version: the running one does it
    const key = { hash, processor: name, version: spec.version };
    // the same content in another file, or queued twice
    if (await this.representations.exists(key)) return;
    const file = await this.takenFile(hash, (f) => spec.match(f));
    // replaced or removed since, or renamed to what the processor doesn't take
    if (!file) return;

    const { parts } = await this.streaming(hash, (content) =>
      instance.process({ ...file, hash, content }),
    );
    await this.representations.save({ ...key, parts });
    this.logger.log(`${name}: ${file.name}, ${parts.length} parts`);
  }

  private async takenFile(
    hash: ContentHash,
    match: (file: FileFact) => string | null,
  ) {
    for (const { name, mime } of await this.files.holding(hash)) {
      const matched = match({ name, mime });
      if (matched !== null) return { name, mime, matched };
    }
    return null;
  }

  // a fresh stream on every call, all of them closed once the run is over
  private async streaming<T>(
    hash: ContentHash,
    run: (content: () => Promise<Readable>) => Promise<T>,
  ) {
    const opened: Readable[] = [];
    let done = false;
    try {
      return await run(async () => {
        const stream = await this.blobs.get(hash);
        // asked for after the run ended: nobody would close it
        if (done) {
          stream.destroy();
          throw new Error('content asked for after the run');
        }
        opened.push(stream);
        return stream;
      });
    } finally {
      done = true;
      for (const stream of opened) stream.destroy();
    }
  }
}
