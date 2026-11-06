import { Injectable } from '@nestjs/common';
import { FILE_CONTENT_STORED, type Message } from '@app/plugin-sdk';
import type { ContentHash } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { MAX_DEPTH } from '../domain/expansion.js';
import type { KnownName } from './content-names.js';
import type { ContentJob, HandleJob, PluginJob } from './plugin-job.js';
import { FileFacts } from './ports.js';

// Which plugins get what: a message goes to the aggregators of its topic,
// content to each processor and expander that takes a name it goes by (a
// file's, or an entry's path). The reconciler and expansions queue through
// here too, so none of them can disagree.
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
    // removed, or given other content, since: processing queued for content
    // no file may hold would keep its job id for a day, and the same content
    // stored in another file meanwhile wouldn't be queued
    if (file?.hash !== hash) return handle;
    return [...this.jobs({ ...file, hash, depth: 0 }), ...handle];
  }

  // each processor's that takes the name, and each expander's while it's
  // less than MAX_DEPTH deep
  jobs(named: KnownName & { hash: ContentHash }): ContentJob[] {
    const { hash, depth } = named;
    const processing = this.plugins
      .processorsFor(named)
      .map(({ processor: { spec } }): ContentJob => ({
        kind: 'process',
        key: { hash, processor: spec.name, version: spec.version },
      }));
    if (depth >= MAX_DEPTH) return processing;
    const expanding = this.plugins
      .expandersFor(named)
      .map(({ spec }): ContentJob => ({
        kind: 'expand',
        key: { hash, expander: spec.name, version: spec.version },
      }));
    return [...processing, ...expanding];
  }
}
