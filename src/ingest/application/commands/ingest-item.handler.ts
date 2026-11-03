import {
  CommandBus,
  CommandHandler,
  EventBus,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { UpsertItemCommand } from '../../../catalog/application/commands/upsert-item.command.js';
import { ItemIngestedEvent } from '../../domain/events.js';
import { IngestItemCommand } from './ingest-item.command.js';

@CommandHandler(IngestItemCommand)
export class IngestItemHandler implements ICommandHandler<IngestItemCommand> {
  constructor(
    private readonly commands: CommandBus,
    private readonly events: EventBus,
  ) {}

  async execute({ portal, record }: IngestItemCommand) {
    const { entity, changed } = await this.commands.execute(
      new UpsertItemCommand({ portal, ...record }),
    );
    if (changed) this.events.publish(new ItemIngestedEvent(portal, entity.id));
    return { changed };
  }
}
