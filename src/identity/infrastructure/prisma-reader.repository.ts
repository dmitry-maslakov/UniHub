import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { ReaderRepository } from '../domain/reader.js';
import { readerColumns, toReader } from './reader.mapper.js';

@Injectable()
export class PrismaReaderRepository extends ReaderRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async findById(userId: string) {
    const row = await this.txHost.tx.user.findUnique({
      where: { id: userId },
      select: readerColumns,
    });
    return row && toReader(row);
  }
}
