import {
  CommandBus,
  CommandHandler,
  EventBus,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { SetFileContentCommand } from '../../../catalog/application/commands/set-file-content.command.js';
import { PutContentCommand } from '../../../storage/application/commands/put-content.command.js';
import { FileContentStoredEvent } from '../../domain/events.js';
import { IngestFileContentCommand } from './ingest-file-content.command.js';

@CommandHandler(IngestFileContentCommand)
export class IngestFileContentHandler implements ICommandHandler<IngestFileContentCommand> {
  constructor(
    private readonly commands: CommandBus,
    private readonly events: EventBus,
  ) {}

  async execute({ portal, externalId, content }: IngestFileContentCommand) {
    const { hash } = await this.commands.execute(
      new PutContentCommand(content),
    );
    const { fileId, changed } = await this.commands.execute(
      new SetFileContentCommand(portal, externalId, hash),
    );
    if (changed)
      this.events.publish(new FileContentStoredEvent(portal, fileId, hash));
    return { hash, changed };
  }
}
