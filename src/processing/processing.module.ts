import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboxToQueues } from './infrastructure/outbox-to-queues.js';
import { FILES_QUEUE, ITEMS_QUEUE } from './queues.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: FILES_QUEUE }, { name: ITEMS_QUEUE }),
  ],
  providers: [OutboxToQueues],
})
export class ProcessingModule {}
