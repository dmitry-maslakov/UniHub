import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { OnOutboxMessage, type OutboxHandlerContext } from '@nestjs/outbox';
import type { Queue } from 'bullmq';
import {
  FILE_CONTENT_STORED,
  ITEM_INGESTED,
  type FileContentStored,
  type ItemIngested,
} from '@app/plugin-sdk';
import { FILES_QUEUE, ITEMS_QUEUE } from '../queues.js';

// Turns outbox messages into queue jobs, where the heavy work happens.
// The message id is the job id, so a redelivered message doesn't queue twice.
@Injectable()
export class OutboxToQueues {
  constructor(
    @InjectQueue(FILES_QUEUE) private readonly files: Queue,
    @InjectQueue(ITEMS_QUEUE) private readonly items: Queue,
  ) {}

  @OnOutboxMessage(FILE_CONTENT_STORED, { consumer: 'files-queue' })
  async fileStored(payload: FileContentStored, ctx: OutboxHandlerContext) {
    await this.files.add(FILE_CONTENT_STORED, payload, {
      jobId: ctx.message.id,
    });
  }

  @OnOutboxMessage(ITEM_INGESTED, { consumer: 'items-queue' })
  async itemIngested(payload: ItemIngested, ctx: OutboxHandlerContext) {
    await this.items.add(ITEM_INGESTED, payload, { jobId: ctx.message.id });
  }
}
