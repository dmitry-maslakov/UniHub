import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import { HasBytesQuery } from '../../application/queries.js';
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
