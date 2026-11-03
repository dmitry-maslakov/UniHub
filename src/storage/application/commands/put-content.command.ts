import type { Readable } from 'node:stream';
import { Command } from '@nestjs/cqrs';
import type { StoredContent } from '../../domain/blob-store.js';

export class PutContentCommand extends Command<StoredContent> {
  constructor(public readonly content: Readable) {
    super();
  }
}
