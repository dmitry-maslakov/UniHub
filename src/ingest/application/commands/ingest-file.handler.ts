import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UpsertFileCommand } from '../../../catalog/application/commands/upsert-file.command.js';
import { IngestFileCommand } from './ingest-file.command.js';

@CommandHandler(IngestFileCommand)
export class IngestFileHandler implements ICommandHandler<IngestFileCommand> {
  constructor(private readonly commands: CommandBus) {}

  async execute({
    portal,
    record: { updatedAt, ...record },
  }: IngestFileCommand) {
    const { changed } = await this.commands.execute(
      new UpsertFileCommand({ portal, ...record, sourceUpdatedAt: updatedAt }),
    );
    return { changed };
  }
}
