import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { FileRepository, type File } from '../../domain/file.js';
import { ItemRepository } from '../../domain/item.js';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { resolveId } from './resolve-id.js';
import { UpsertFileCommand } from './upsert-file.command.js';

// a rename or a move doesn't make the connector download the file again
const contentMayDiffer = (a: File, b: File) =>
  a.size !== b.size ||
  a.sourceUpdatedAt?.getTime() !== b.sourceUpdatedAt?.getTime();

@CommandHandler(UpsertFileCommand)
export class UpsertFileHandler implements ICommandHandler<UpsertFileCommand> {
  constructor(
    private readonly files: FileRepository,
    private readonly courses: PortalCourseRepository,
    private readonly items: ItemRepository,
  ) {}

  @Transactional()
  async execute({ data: { course, item, ...data } }: UpsertFileCommand) {
    const portalCourseId = await resolveId(this.courses, data.portal, course);
    const itemId = await resolveId(this.items, data.portal, item);
    const { entity, previous, changed } = await this.files.upsert({
      ...data,
      portalCourseId,
      itemId,
    });
    const needsContent =
      entity.contentHash === null ||
      (previous !== null && contentMayDiffer(previous, entity));
    return { id: entity.id, changed, needsContent };
  }
}
