import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { FILE_CONTENT_STORED } from '@app/plugin-sdk';
import {
  ListFilesWithContentQuery,
  type FileDto,
} from '../../catalog/contracts.js';
import { PluginRegistry } from '../../plugins/plugin-registry.js';
import { RepresentationRepository } from '../domain/representation.js';
import { PLUGINS_QUEUE, type PluginJob } from '../queues.js';

const PAGE = 500;

// Queues processing that should exist but doesn't: a new processor, a new
// version of one, a file renamed to a type it now accepts, work lost with
// redis. The job id is per content, so files sharing it queue one job.
@Injectable()
export class Reconciler {
  constructor(
    private readonly queries: QueryBus,
    private readonly registry: PluginRegistry,
    private readonly representations: RepresentationRepository,
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
  ) {}

  async run() {
    let queued = 0;
    let after: string | null = null;
    for (;;) {
      const files: FileDto[] = await this.queries.execute(
        new ListFilesWithContentQuery(after, PAGE),
      );
      for (const file of files) {
        const hash = file.contentHash!;
        for (const { options } of this.registry.processorsFor(file)) {
          const { name, version } = options;
          if (await this.representations.exists(hash, name, version)) continue;
          await this.queue.add(
            name,
            {
              plugin: name,
              message: {
                topic: FILE_CONTENT_STORED,
                payload: { portal: file.portal, fileId: file.id, hash },
              },
            },
            { jobId: `reconcile__${hash}__${name}__${version}` },
          );
          queued++;
        }
      }
      if (files.length < PAGE) return queued;
      after = files[files.length - 1].id;
    }
  }
}
