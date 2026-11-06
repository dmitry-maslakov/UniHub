import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import {
  fingerprintOf,
  viewChange,
  type Sighting,
} from '../domain/view/view.js';
import { ViewRepository, type Kind } from '../domain/view/view.repository.js';
import { UnknownReferenceError } from '../domain/errors.js';
import type { Shown } from '../domain/publication.js';
import {
  ForgetAccountCommand,
  StoreBytesCommand,
  ViewCourseCommand,
  ViewCoursesCommand,
} from './commands.js';

// What users' own accounts see (README, Portal accounts): each pass gives
// one account's view of a course, as versions the accounts that see a
// record alike share, and the account's sights of them, shown and opened
// at the times the pass's publication gives.

// the account's view of a kind, as what it sent changes it
async function changeView(
  views: ViewRepository,
  kind: Kind,
  account: string,
  course: string | null,
  sent: Sighting[],
  gone: ReadonlySet<string> | undefined,
  at: Shown,
) {
  const before = await views.sightings(kind, account, course);
  const change = viewChange(before, sent, gone);
  await views.apply(kind, account, change, at);
  return change;
}

const idOf = (ids: Map<string, string>, externalId: string) =>
  ids.get(externalId)!;

@CommandHandler(ViewCoursesCommand)
export class ViewCoursesHandler implements ICommandHandler<ViewCoursesCommand> {
  constructor(private readonly views: ViewRepository) {}

  @Transactional()
  async execute({ account, portal, courses, kept, at }: ViewCoursesCommand) {
    const ids = await this.views.recordIds(
      'course',
      portal,
      courses.map((c) => c.externalId),
    );
    const sent: Sighting[] = [];
    for (const { portal: _, ...record } of courses) {
      const { externalId, ...data } = record;
      const recordId = idOf(ids, externalId);
      const versionId = await this.views.versionOf(
        'course',
        recordId,
        fingerprintOf(record),
        data,
      );
      sent.push({ recordId, versionId, open: true });
    }
    // a whole listing: what it didn't send is gone, but for the courses
    // whose records were refused, kept with what the account saw in them
    const refused = new Set(
      (await this.views.recordIds('course', portal, kept, false)).values(),
    );
    const before = await this.views.sightings('course', account, null);
    const gone = new Set(
      before.map((s) => s.recordId).filter((id) => !refused.has(id)),
    );
    const change = viewChange(before, sent, gone);
    await this.views.apply('course', account, change, at);
    // what it saw in a course it's no longer in goes with the course
    const still = new Set(sent.map((s) => s.recordId));
    for (const { recordId: course } of change.hide.filter(
      (s) => !still.has(s.recordId),
    ))
      for (const kind of ['item', 'file'] as const)
        await changeView(this.views, kind, account, course, [], undefined, at);
  }
}

@CommandHandler(ViewCourseCommand)
export class ViewCourseHandler implements ICommandHandler<ViewCourseCommand> {
  constructor(private readonly views: ViewRepository) {}

  @Transactional()
  async execute({
    account,
    portal,
    course,
    items,
    files,
    gone,
    at,
  }: ViewCourseCommand) {
    const courseId = (
      await this.views.recordIds('course', portal, [course], false)
    ).get(course);
    const named =
      courseId !== undefined &&
      (await this.views.sightings('course', account, null)).some(
        (s) => s.recordId === courseId,
      );
    if (!named) throw new UnknownReferenceError(portal, course);
    const itemIds = await this.views.recordIds('item', portal, [
      ...items.map(({ record }) => record.externalId),
      ...files.flatMap(({ record }) => (record.item ? [record.item] : [])),
    ]);
    const fileIds = await this.views.recordIds(
      'file',
      portal,
      files.map(({ record }) => record.externalId),
    );
    const sentItems: Sighting[] = [];
    for (const { record, open } of items) {
      const { portal: _, course: __, externalId, ...data } = record;
      const recordId = idOf(itemIds, externalId);
      const versionId = await this.views.versionOf(
        'item',
        recordId,
        fingerprintOf({ ...record, portal: undefined }),
        { ...data, portalCourseId: courseId },
      );
      sentItems.push({ recordId, versionId, open });
    }
    const sentFiles: Sighting[] = [];
    for (const { record, open } of files) {
      const { portal: _, course: __, externalId, item, ...data } = record;
      const recordId = idOf(fileIds, externalId);
      const versionId = await this.views.versionOf(
        'file',
        recordId,
        fingerprintOf({ ...record, portal: undefined }),
        {
          ...data,
          portalCourseId: courseId,
          itemId: item ? idOf(itemIds, item) : null,
        },
      );
      sentFiles.push({ recordId, versionId, open });
    }
    const goneOf = async (kind: Kind, externalIds: readonly string[]) =>
      new Set(
        (await this.views.recordIds(kind, portal, externalIds, false)).values(),
      );
    await changeView(
      this.views,
      'item',
      account,
      courseId,
      sentItems,
      await goneOf('item', gone.items),
      at,
    );
    await changeView(
      this.views,
      'file',
      account,
      courseId,
      sentFiles,
      await goneOf('file', gone.files),
      at,
    );
  }
}

@CommandHandler(ForgetAccountCommand)
export class ForgetAccountHandler implements ICommandHandler<ForgetAccountCommand> {
  constructor(private readonly views: ViewRepository) {}

  execute({ account }: ForgetAccountCommand) {
    return this.views.forget(account);
  }
}

@CommandHandler(StoreBytesCommand)
export class StoreBytesHandler implements ICommandHandler<StoreBytesCommand> {
  constructor(private readonly views: ViewRepository) {}

  @Transactional()
  async execute({ file, stamp, hash }: StoreBytesCommand) {
    const fileId = (
      await this.views.recordIds('file', file.portal, [file.externalId], false)
    ).get(file.externalId);
    if (!fileId) throw new UnknownReferenceError(file.portal, file.externalId);
    return { changed: await this.views.storeBytes(fileId, stamp, hash) };
  }
}
