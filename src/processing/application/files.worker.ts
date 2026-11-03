import { Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { FileContentStored } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import { PluginRegistry } from '../../plugins/plugin-registry.js';
import { GetContentQuery } from '../../storage/contracts.js';
import { FILES_QUEUE } from '../queues.js';

// runs the content processors that accept the file, then the aggregators
// interested in the message
@Processor(FILES_QUEUE)
export class FilesWorker extends WorkerHost {
  private readonly logger = new Logger(FilesWorker.name);

  constructor(
    private readonly plugins: PluginRegistry,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  async process(job: Job<FileContentStored>) {
    const { fileId, hash } = job.data;
    const file = await this.queries.execute(new GetFileQuery(fileId));
    // the file can be gone by the time the job runs
    if (!file) return;

    for (const { options, instance } of this.plugins.processorsFor(file)) {
      const result = await instance.process({
        fileId,
        name: file.name,
        mime: file.mime,
        hash,
        content: () => this.queries.execute(new GetContentQuery(hash)),
      });
      // results are stored with #13, for now they're only counted
      this.logger.log(
        `${options.name} v${options.version}: ${file.name}, ${result.parts.length} parts`,
      );
    }

    for (const { instance } of this.plugins.aggregatorsFor(job.name))
      await instance.handle(job.name, job.data);
  }
}
