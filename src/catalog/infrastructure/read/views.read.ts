import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { SHARED_ACCOUNT } from '@app/kernel';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import { HasBytesQuery, SharedViewQuery } from '../../application/queries.js';
import { ofRecord, stampOf } from '../rows.js';

@QueryHandler(HasBytesQuery)
export class HasBytesHandler implements IQueryHandler<HasBytesQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ file, stamp }: HasBytesQuery) {
    const found = await this.txHost.tx.fileVersion.findFirst({
      where: {
        file: ofRecord(file),
        contentHash: { not: null },
        contentStale: false,
        ...stampOf(stamp),
      },
      select: { id: true },
    });
    return found !== null;
  }
}

@QueryHandler(SharedViewQuery)
export class SharedViewHandler implements IQueryHandler<SharedViewQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ course }: SharedViewQuery) {
    const { tx } = this.txHost;
    const where = {
      portalCourse: ofRecord(course),
      sights: { some: { account: SHARED_ACCOUNT, hiddenFrom: null } },
    };
    const [items, files] = await Promise.all([
      tx.itemVersion.findMany({
        where,
        select: { item: { select: { externalId: true } } },
      }),
      tx.fileVersion.findMany({
        where,
        select: { file: { select: { externalId: true } } },
      }),
    ]);
    return {
      items: items.map((v) => v.item.externalId),
      files: files.map((v) => v.file.externalId),
    };
  }
}
