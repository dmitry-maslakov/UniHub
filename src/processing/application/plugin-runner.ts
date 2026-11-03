import type { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { FILE_CONTENT_STORED } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import { PluginRegistry } from '../../plugins/plugin-registry.js';
import { GetContentQuery } from '../../storage/contracts.js';
import { RepresentationRepository } from '../domain/representation.js';
import type { PluginJob } from '../queues.js';

// runs one plugin for one message
@Injectable()
export class PluginRunner {
  private readonly logger = new Logger(PluginRunner.name);

  constructor(
    private readonly registry: PluginRegistry,
    private readonly queries: QueryBus,
    private readonly representations: RepresentationRepository,
  ) {}

  async run({ plugin, message }: PluginJob) {
    const found = this.registry.runnable(plugin);
    // turned off since the job was queued
    if (!found) return;

    if (found.kind === 'aggregator') {
      await found.plugin.instance.handle(message);
      return;
    }

    if (message.topic !== FILE_CONTENT_STORED) return;
    const { fileId, hash } = message.payload;
    const file = await this.queries.execute(new GetFileQuery(fileId));
    // gone, or the job is about content that has been replaced since
    if (!file || file.removed || file.contentHash !== hash) return;
    // the same content in another file, or a job queued twice
    const { name, version } = found.plugin.options;
    if (await this.representations.exists(hash, name, version)) return;

    const opened: Readable[] = [];
    let done = false;
    try {
      const result = await found.plugin.instance.process({
        name: file.name,
        mime: file.mime,
        hash,
        content: async () => {
          const stream = await this.queries.execute(new GetContentQuery(hash));
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
