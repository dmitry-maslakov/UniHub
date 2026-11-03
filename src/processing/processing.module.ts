import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesWorker } from './application/files.worker.js';
import { ItemsWorker } from './application/items.worker.js';
import { OutboxToQueues } from './infrastructure/outbox-to-queues.js';
import { FILES_QUEUE, ITEMS_QUEUE } from './queues.js';

// a failed job is retried with backoff, plugins have to be idempotent
const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
};

@Module({
  imports: [
    BullModule.registerQueue(
      { name: FILES_QUEUE, defaultJobOptions },
      { name: ITEMS_QUEUE, defaultJobOptions },
    ),
  ],
  providers: [OutboxToQueues, FilesWorker, ItemsWorker],
})
export class ProcessingModule {}
