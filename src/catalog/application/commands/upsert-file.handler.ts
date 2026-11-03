import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { ItemRepository } from '../../domain/item.js';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { UpsertFileCommand } from './upsert-file.command.js';
import { resolveId } from './resolve-id.js';

@CommandHandler(UpsertFileCommand)
export class UpsertFileHandler implements ICommandHandler<UpsertFileCommand> {
  constructor(
    private readonly files: FileRepository,
    private readonly courses: PortalCourseRepository,
    private readonly items: ItemRepository,
  ) {}

  async execute({ data: { course, item, ...data } }: UpsertFileCommand) {
    const [portalCourseId, itemId] = await Promise.all([
      resolveId(this.courses, data.portal, course),
      resolveId(this.items, data.portal, item),
    ]);
    return this.files.upsert({ ...data, portalCourseId, itemId });
  }
}
