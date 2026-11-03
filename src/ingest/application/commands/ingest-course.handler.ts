import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UpsertPortalCourseCommand } from '../../../catalog/application/commands/upsert-portal-course.command.js';
import { IngestCourseCommand } from './ingest-course.command.js';

@CommandHandler(IngestCourseCommand)
export class IngestCourseHandler implements ICommandHandler<IngestCourseCommand> {
  constructor(private readonly commands: CommandBus) {}

  async execute({ portal, record }: IngestCourseCommand) {
    const { changed } = await this.commands.execute(
      new UpsertPortalCourseCommand({ portal, ...record }),
    );
    return { changed };
  }
}
