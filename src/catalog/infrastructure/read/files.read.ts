import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  FindFileQuery,
  GetCourseFileQuery,
  GetFileQuery,
  ListCourseFilesQuery,
  ListFilesWithContentQuery,
  type FileDto,
} from '../../application/queries.js';
import { byPortalRef, fileValues } from '../rows.js';
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
      orderBy: [{ path: 'asc' }, { name: 'asc' }, { id: 'asc' }],
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
      select: {
        ...select,
        portalCourse: { select: { link: { select: { courseId: true } } } },
      },
    });
    const courseId = row?.portalCourse?.link?.courseId;
    if (!row || !courseId) return null;
    const { portalCourse: _, ...file } = row;
    return { ...toDto(file), courseId };
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
