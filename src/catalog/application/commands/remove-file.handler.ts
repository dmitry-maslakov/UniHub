import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { CatalogEvents } from '../../domain/events.js';
import { FileRepository } from '../../domain/file.js';
import { RemoveFileCommand } from './remove-file.command.js';

@CommandHandler(RemoveFileCommand)
export class RemoveFileHandler implements ICommandHandler<RemoveFileCommand> {
  constructor(
    private readonly files: FileRepository,
    private readonly events: CatalogEvents,
  ) {}

  @Transactional()
  async execute({ portal, externalId }: RemoveFileCommand) {
    const removed = await this.files.markRemoved(portal, externalId);
    if (removed?.changed)
      await this.events.fileRemoved({ portal, fileId: removed.id });
    return { changed: removed?.changed ?? false };
  }
}
