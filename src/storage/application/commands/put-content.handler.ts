import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { BlobStore } from '../../domain/blob-store.js';
import { PutContentCommand } from './put-content.command.js';

@CommandHandler(PutContentCommand)
export class PutContentHandler implements ICommandHandler<PutContentCommand> {
  constructor(private readonly blobs: BlobStore) {}

  execute({ content }: PutContentCommand) {
    return this.blobs.put(content);
  }
}
