import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { CatalogEvents } from '../../domain/events.js';
import { FileRepository } from '../../domain/file.js';
import { SetFileContentCommand } from './set-file-content.command.js';

@CommandHandler(SetFileContentCommand)
export class SetFileContentHandler implements ICommandHandler<SetFileContentCommand> {
  constructor(
    private readonly files: FileRepository,
    private readonly events: CatalogEvents,
  ) {}

  @Transactional()
  async execute({ fileId, hash }: SetFileContentCommand) {
    const file = await this.files.findById(fileId);
    if (!file) throw new Error(`file ${fileId} not found`);
    const changed = await this.files.setContentHash(fileId, hash);
    if (changed)
      await this.events.fileContentChanged({
        portal: file.portal,
        fileId,
        hash,
      });
    return { changed };
  }
}
