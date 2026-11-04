import type { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { FILE_CONTENT_STORED } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import { PluginCatalog } from '../../plugins/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { RepresentationRepository } from '../domain/representation.js';
import type { PluginJob } from '../queues.js';

// runs one plugin for one message
@Injectable()
export class PluginRunner {
  private readonly logger = new Logger(PluginRunner.name);

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
    private readonly representations: RepresentationRepository,
  ) {}

  async run({ plugin, message }: PluginJob) {
    const aggregator = this.plugins.aggregator(plugin);
    if (aggregator) return aggregator.instance.handle(message);
    const processor = this.plugins.processor(plugin);
    // turned off since the job was queued
    if (!processor || message.topic !== FILE_CONTENT_STORED) return;

    const { fileId } = message.payload;
    const file = await this.queries.execute(new GetFileQuery(fileId));
    // gone, or the job is about content that has been replaced since
    if (!file || file.removed || file.contentHash !== message.payload.hash)
      return;
    // renamed since to something the processor doesn't take
    const matched = processor.spec.match(file);
    if (matched === null) return;
    const hash = file.contentHash;
    // the same content in another file, or a job queued twice
    const { name, version } = processor.spec;
    if (await this.representations.exists(hash, name, version)) return;

    const opened: Readable[] = [];
    let done = false;
    try {
      const result = await processor.instance.process({
        name: file.name,
        mime: file.mime,
        matched,
        hash,
        content: async () => {
          const stream = await this.blobs.get(hash);
          // asked for after the run ended: nobody would close it
          if (done) {
            stream.destroy();
            throw new Error(`${plugin} asked for content after it finished`);
          }
          opened.push(stream);
          return stream;
        },
      });
      await this.representations.save({
        hash,
        processor: name,
        version,
        parts: result.parts,
      });
      this.logger.log(`${plugin}: ${file.name}, ${result.parts.length} parts`);
    } finally {
      done = true;
      for (const stream of opened) stream.destroy();
    }
  }
}
