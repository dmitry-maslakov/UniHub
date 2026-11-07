import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  FindFileQuery,
  GetCourseFileQuery,
  GetFileQuery,
  ListCourseFilesQuery,
  ListFilesOfContentQuery,
  ListFilesWithContentQuery,
  ListVisibleContentQuery,
  type FileDto,
  type Viewers,
} from '../../application/queries.js';
import {
  contentOf,
  fileValues,
  liveSights,
  ofRecord,
  portalOf,
  recordRef,
  seen,
  sharedSight,
} from '../rows.js';
import {
  courseOf,
  fileSeen,
  inCourses,
  itemSeen,
  opening,
  opens,
  withCourse,
} from './viewers.js';

// a version, with its record's ids and whether any account sees it
const select = (now = new Date()) =>
  ({
    id: true,
    portalCourseId: true,
    itemId: true,
    name: true,
    path: true,
    url: true,
    size: true,
    mime: true,
    contentHash: true,
    file: recordRef,
    sights: liveSights(now),
  }) satisfies Prisma.FileVersionSelect;

const byFolderAndName = [
  { path: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
] satisfies Prisma.FileVersionOrderByWithRelationInput[];

const toDto = ({
  file,
  sights,
  ...row
}: Prisma.FileVersionGetPayload<{
  select: ReturnType<typeof select>;
}>): FileDto => ({
  ...row,
  ...fileValues(row),
  portal: portalOf(file),
  externalId: file.externalId,
  removed: sights.length === 0,
});

// a file as the viewers read it: its content once their view opens it,
// its post as they see it
const forViewers = (viewers: Viewers, now: Date) =>
  ({
    ...select(now),
    _count: { select: { sights: { where: opening(viewers, now) } } },
    item: {
      select: {
        versions: {
          where: itemSeen(viewers, now),
          take: 1,
          select: { id: true },
        },
      },
    },
  }) satisfies Prisma.FileVersionSelect;

const toViewersDto = ({
  _count,
  item,
  ...row
}: Prisma.FileVersionGetPayload<{
  select: ReturnType<typeof forViewers>;
}>): FileDto => {
  const file = toDto(row);
  return {
    ...file,
    itemId: item?.versions[0]?.id ?? null,
    contentHash: _count.sights ? file.contentHash : null,
  };
};

@QueryHandler(ListCourseFilesQuery)
export class ListCourseFilesHandler implements IQueryHandler<ListCourseFilesQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({
    viewers,
    portalCourseIds,
    offset,
    limit,
  }: ListCourseFilesQuery) {
    const now = new Date();
    const rows = await this.txHost.tx.fileVersion.findMany({
      where: { AND: [inCourses(portalCourseIds), fileSeen(viewers, now)] },
      orderBy: byFolderAndName,
      skip: offset,
      take: limit,
      select: forViewers(viewers, now),
    });
    return rows.map(toViewersDto);
  }
}

@QueryHandler(GetCourseFileQuery)
export class GetCourseFileHandler implements IQueryHandler<GetCourseFileQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ viewers, fileId }: GetCourseFileQuery) {
    const now = new Date();
    const row = await this.txHost.tx.fileVersion.findFirst({
      where: { AND: [{ id: fileId }, fileSeen(viewers, now)] },
      select: { ...forViewers(viewers, now), ...withCourse },
    });
    const courseId = row && courseOf(row);
    if (!row || !courseId) return null;
    const { portalCourse: _, ...file } = row;
    return { ...toViewersDto(file), courseId };
  }
}

@QueryHandler(ListVisibleContentQuery)
export class ListVisibleContentHandler implements IQueryHandler<ListVisibleContentQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ viewers, portalCourseIds }: ListVisibleContentQuery) {
    const now = new Date();
    const rows = await this.txHost.tx.fileVersion.findMany({
      where: {
        AND: [
          inCourses(portalCourseIds),
          fileSeen(viewers, now, opens(now)),
          { contentHash: { not: null } },
        ],
      },
      orderBy: byFolderAndName,
      select: {
        id: true,
        name: true,
        path: true,
        contentHash: true,
        ...withCourse,
      },
    });
    // the filter leaves only rows with both, which Prisma's types can't tell
    return rows.flatMap(({ id, name, path, portalCourse, ...row }) => {
      const courseId = courseOf({ portalCourse });
      const hash = contentOf(row);
      return portalCourse && courseId && hash
        ? [
            {
              fileId: id,
              courseId,
              portalCourseId: portalCourse.id,
              hash,
              name,
              path,
            },
          ]
        : [];
    });
  }
}

@QueryHandler(GetFileQuery)
export class GetFileHandler implements IQueryHandler<GetFileQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ id }: GetFileQuery) {
    const row = await this.txHost.tx.fileVersion.findUnique({
      where: { id },
      select: select(),
    });
    return row && toDto(row);
  }
}

@QueryHandler(FindFileQuery)
export class FindFileHandler implements IQueryHandler<FindFileQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ file }: FindFileQuery) {
    const row = await this.txHost.tx.fileVersion.findFirst({
      where: { file: ofRecord(file), sights: { some: sharedSight } },
      select: select(),
    });
    return row && toDto(row);
  }
}

@QueryHandler(ListFilesOfContentQuery)
export class ListFilesOfContentHandler implements IQueryHandler<ListFilesOfContentQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ hash }: ListFilesOfContentQuery) {
    const rows = await this.txHost.tx.fileVersion.findMany({
      where: { contentHash: hash, sights: seen() },
      orderBy: { id: 'asc' },
      select: select(),
    });
    return rows.map(toDto);
  }
}

@QueryHandler(ListFilesWithContentQuery)
export class ListFilesWithContentHandler implements IQueryHandler<ListFilesWithContentQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ after, limit }: ListFilesWithContentQuery) {
    const rows = await this.txHost.tx.fileVersion.findMany({
      where: {
        contentHash: { not: null },
        sights: seen(),
        ...(after && { id: { gt: after } }),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: select(),
    });
    return rows.map(toDto);
  }
}
