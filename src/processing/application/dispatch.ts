import { Injectable } from '@nestjs/common';
import { FILE_CONTENT_STORED, type Message } from '@app/plugin-sdk';
import type { ContentHash } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import type { HandleJob, PluginJob, ProcessJob } from './plugin-job.js';
import { FileFacts, type FileFact } from './ports.js';

// Which plugins get what: a message goes to the aggregators of its topic,
// stored content to each processor that takes its file. The reconciler
// queues processing through here too, so the two can't disagree.
@Injectable()
export class Dispatch {
  constructor(
    private readonly plugins: PluginCatalog,
    private readonly files: FileFacts,
  ) {}

  async jobsFor(messageId: string, message: Message): Promise<PluginJob[]> {
    const handle = this.plugins
      .aggregatorsFor(message.topic)
      .map(({ spec }): HandleJob => ({
        kind: 'handle',
        messageId,
        aggregator: spec.name,
        message,
      }));
    if (message.topic !== FILE_CONTENT_STORED) return handle;
    const { fileId, hash } = message.payload;
    const file = await this.files.file(fileId);
    return file ? [...this.processing({ ...file, hash }), ...handle] : handle;
  }

  processing(file: FileFact & { hash: ContentHash }): ProcessJob[] {
    return this.plugins.processorsFor(file).map(({ processor: { spec } }) => ({
      kind: 'process',
      key: { hash: file.hash, processor: spec.name, version: spec.version },
    }));
  }
}
