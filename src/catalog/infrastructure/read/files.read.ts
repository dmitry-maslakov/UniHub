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
import { visibleFile } from './visibility.js';

// a version, with its record's ids and whether any account sees it
const select = {
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
  sights: liveSights,
} satisfies Prisma.FileVersionSelect;

// the course a visible file shows in (see visibleFile)
const withCourse = {
  portalCourse: { select: { link: { select: { courseId: true } } } },
} satisfies Prisma.FileVersionSelect;

const byFolderAndName = [
  { path: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
] satisfies Prisma.FileVersionOrderByWithRelationInput[];

const toDto = ({
  file,
  sights,
  ...row
}: Prisma.FileVersionGetPayload<{ select: typeof select }>): FileDto => ({
  ...row,
  ...fileValues(row),
  portal: portalOf(file),
  externalId: file.externalId,
  removed: sights.length === 0,
});

@QueryHandler(ListCourseFilesQuery)
export class ListCourseFilesHandler implements IQueryHandler<ListCourseFilesQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ courseId, offset, limit }: ListCourseFilesQuery) {
    const rows = await this.txHost.tx.fileVersion.findMany({
      where: visibleFile({ courseId }),
      orderBy: byFolderAndName,
      skip: offset,
      take: limit,
      select,
    });
    return rows.map(toDto);
  }
}

@QueryHandler(GetCourseFileQuery)
export class GetCourseFileHandler implements IQueryHandler<GetCourseFileQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ fileId }: GetCourseFileQuery) {
    const row = await this.txHost.tx.fileVersion.findFirst({
      where: { AND: [{ id: fileId }, visibleFile()] },
      select: { ...select, ...withCourse },
    });
    const courseId = row?.portalCourse?.link?.courseId;
    if (!row || !courseId) return null;
    const { portalCourse: _, ...file } = row;
    return { ...toDto(file), courseId };
  }
}

@QueryHandler(ListVisibleContentQuery)
export class ListVisibleContentHandler implements IQueryHandler<ListVisibleContentQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ courseIds }: ListVisibleContentQuery) {
    const rows = await this.txHost.tx.fileVersion.findMany({
      where: {
        AND: [
          visibleFile({ courseId: { in: [...courseIds] } }),
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
      const courseId = portalCourse?.link?.courseId;
      const hash = contentOf(row);
      return courseId && hash
        ? [{ fileId: id, courseId, hash, name, path }]
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
      select,
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
      select,
    });
    return row && toDto(row);
  }
}

@QueryHandler(ListFilesOfContentQuery)
export class ListFilesOfContentHandler implements IQueryHandler<ListFilesOfContentQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ hash }: ListFilesOfContentQuery) {
    const rows = await this.txHost.tx.fileVersion.findMany({
      where: { contentHash: hash, sights: seen },
      orderBy: { id: 'asc' },
      select,
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
        sights: seen,
        ...(after && { id: { gt: after } }),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select,
    });
    return rows.map(toDto);
  }
}
