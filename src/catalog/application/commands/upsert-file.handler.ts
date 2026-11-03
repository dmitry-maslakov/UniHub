import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { CatalogEvents } from '../../domain/events.js';
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
    private readonly events: CatalogEvents,
  ) {}

  @Transactional()
  async execute({ data: { course, item, ...data } }: UpsertFileCommand) {
    const itemId = await resolveId(this.items, data.portal, item);
    // a file attached to a post belongs to the post's course
    const portalCourseId =
      course === null && itemId
        ? ((await this.items.findById(itemId))?.portalCourseId ?? null)
        : await resolveId(this.courses, data.portal, course);
    // sending a removed file again brings it back
    const { entity, previous, changed } = await this.files.upsert({
      ...data,
      portalCourseId,
      itemId,
      removedAt: null,
    });

    let stale = entity.contentStale;
    if (previous && entity.contentHash && contentMayDiffer(previous, entity)) {
      // stays stale until new content arrives, even if this run fails to send it
      await this.files.markContentStale(entity.id);
      stale = true;
    }
    if (previous?.removedAt && entity.contentHash)
      // plugins dropped what they had on file.removed, give it to them again
      await this.events.fileContentChanged({
        portal: data.portal,
        fileId: entity.id,
        hash: entity.contentHash,
      });

    return {
      id: entity.id,
      changed,
      needsContent: entity.contentHash === null || stale,
    };
  }
}
