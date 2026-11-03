import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { UpsertFileCommand } from './upsert-file.command.js';

@CommandHandler(UpsertFileCommand)
export class UpsertFileHandler implements ICommandHandler<UpsertFileCommand> {
  constructor(private readonly repository: FileRepository) {}

  execute({ data }: UpsertFileCommand) {
    return this.repository.upsert(data);
  }
}
