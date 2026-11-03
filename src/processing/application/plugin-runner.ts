import type { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { FILE_CONTENT_STORED } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import { PluginRegistry } from '../../plugins/plugin-registry.js';
import { GetContentQuery } from '../../storage/contracts.js';
import type { PluginJob } from '../queues.js';

// runs one plugin for one message
@Injectable()
export class PluginRunner {
  private readonly logger = new Logger(PluginRunner.name);

  constructor(
    private readonly registry: PluginRegistry,
    private readonly queries: QueryBus,
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

    const opened: Readable[] = [];
    try {
      const result = await found.plugin.instance.process({
        name: file.name,
        mime: file.mime,
        hash,
        content: async () => {
          const stream = await this.queries.execute(new GetContentQuery(hash));
          opened.push(stream);
          return stream;
        },
      });
      // results get stored with #13
      this.logger.log(`${plugin}: ${file.name}, ${result.parts.length} parts`);
    } finally {
      for (const stream of opened) stream.destroy();
    }
  }
}
