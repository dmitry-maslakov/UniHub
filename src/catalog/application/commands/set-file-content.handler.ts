import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { SetFileContentCommand } from './set-file-content.command.js';
import { resolveId } from './resolve-id.js';

@CommandHandler(SetFileContentCommand)
export class SetFileContentHandler implements ICommandHandler<SetFileContentCommand> {
  constructor(private readonly files: FileRepository) {}

  async execute({ portal, externalId, hash }: SetFileContentCommand) {
    const fileId = (await resolveId(this.files, portal, externalId))!;
    const changed = await this.files.setContentHash(fileId, hash);
    return { fileId, changed };
  }
}
