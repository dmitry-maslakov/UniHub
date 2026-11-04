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
import { byPortalRef, contentOf, fileValues } from '../rows.js';
import { visibleFile } from './visibility.js';

const select = {
  id: true,
  portal: true,
  externalId: true,
  portalCourseId: true,
  itemId: true,
  name: true,
  path: true,
  url: true,
  size: true,
  mime: true,
  contentHash: true,
  removedAt: true,
} satisfies Prisma.FileSelect;

// the course a visible file shows in (see visibleFile)
const withCourse = {
  portalCourse: { select: { link: { select: { courseId: true } } } },
} satisfies Prisma.FileSelect;

const byFolderAndName = [
  { path: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
] satisfies Prisma.FileOrderByWithRelationInput[];

const toDto = ({
  removedAt,
  ...row
}: Prisma.FileGetPayload<{ select: typeof select }>): FileDto => ({
  ...row,
  ...fileValues(row),
  removed: removedAt !== null,
});

@QueryHandler(ListCourseFilesQuery)
export class ListCourseFilesHandler implements IQueryHandler<ListCourseFilesQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ courseId, offset, limit }: ListCourseFilesQuery) {
    const rows = await this.txHost.tx.file.findMany({
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
    const row = await this.txHost.tx.file.findFirst({
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
    const rows = await this.txHost.tx.file.findMany({
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
    const row = await this.txHost.tx.file.findUnique({
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
    const row = await this.txHost.tx.file.findUnique({
      where: byPortalRef(file),
      select,
    });
    return row && toDto(row);
  }
}

@QueryHandler(ListFilesOfContentQuery)
export class ListFilesOfContentHandler implements IQueryHandler<ListFilesOfContentQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ hash }: ListFilesOfContentQuery) {
    const rows = await this.txHost.tx.file.findMany({
      where: { contentHash: hash, removedAt: null },
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
    const rows = await this.txHost.tx.file.findMany({
      where: {
        contentHash: { not: null },
        removedAt: null,
        ...(after && { id: { gt: after } }),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select,
    });
    return rows.map(toDto);
  }
}
