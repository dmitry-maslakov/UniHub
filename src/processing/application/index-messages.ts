import { Injectable, Optional } from '@nestjs/common';
import {
  FILE_CONTENT_STORED,
  FILE_REMOVED,
  ITEM_INGESTED,
  ITEM_REMOVED,
  type Message,
} from '@app/plugin-sdk';
import type { RecordRef } from '../domain/records.js';
import { TextIndexQueue } from './ports.js';

// the record a message changed: a post's text, a file's name (one stored
// content is a file's first, or new, or back from removed)
export function recordOf(message: Message): RecordRef | null {
  switch (message.topic) {
    case ITEM_INGESTED:
    case ITEM_REMOVED:
      return { kind: 'post', id: message.payload.itemId };
    case FILE_CONTENT_STORED:
    case FILE_REMOVED:
      return { kind: 'file', id: message.payload.fileId };
  }
}

// What the search index makes of a message the plugins get too: a job for
// the record it changed, under the message's id, so one the relay
// publishes again is queued once. None with search off.
@Injectable()
export class IndexMessages {
  constructor(
    // none when search is off
    @Optional() private readonly queue?: TextIndexQueue,
  ) {}

  async publish(messageId: string, message: Message) {
    const record = recordOf(message);
    if (record) await this.queue?.enqueueRecord(record, messageId);
  }
}
