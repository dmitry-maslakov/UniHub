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
import {
  FILE_CONTENT_CHANGED,
  ITEM_CHANGED,
  type FileContentChanged,
  type ItemChanged,
} from '../../catalog/contracts.js';
import { FILES_QUEUE, ITEMS_QUEUE } from '../queues.js';

// Turns catalog's outbox messages into queue jobs carrying sdk messages.
// The message id is the job id, so a redelivered message doesn't queue twice.
@Injectable()
export class OutboxToQueues {
  constructor(
    @InjectQueue(FILES_QUEUE) private readonly files: Queue,
    @InjectQueue(ITEMS_QUEUE) private readonly items: Queue,
  ) {}

  @OnOutboxMessage(FILE_CONTENT_CHANGED, { consumer: 'files-queue' })
  async fileContentChanged(
    { portal, fileId, hash }: FileContentChanged,
    ctx: OutboxHandlerContext,
  ) {
    const message: FileContentStored = { portal, fileId, hash };
    await this.files.add(FILE_CONTENT_STORED, message, {
      jobId: ctx.message.id,
    });
  }

  @OnOutboxMessage(ITEM_CHANGED, { consumer: 'items-queue' })
  async itemChanged(
    { portal, itemId }: ItemChanged,
    ctx: OutboxHandlerContext,
  ) {
    const message: ItemIngested = { portal, itemId };
    await this.items.add(ITEM_INGESTED, message, { jobId: ctx.message.id });
  }
}
