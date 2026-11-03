import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  RepresentationRepository,
  type Representation,
} from '../domain/representation.js';

@Injectable()
export class PrismaRepresentationRepository extends RepresentationRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  async exists(hash: string, processor: string, version: number) {
    const row = await this.txHost.tx.representation.findUnique({
      where: { hash_processor_version: { hash, processor, version } },
      select: { hash: true },
    });
    return row !== null;
  }

  async latestOf(hash: string) {
    const rows = await this.txHost.tx.representation.findMany({
      where: { hash },
      distinct: ['processor'],
      orderBy: [{ processor: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r) => ({
      hash: r.hash,
      processor: r.processor,
      version: r.version,
      parts: r.parts as string[],
    }));
  }

  async save({ hash, processor, version, parts }: Representation) {
    await this.txHost.tx.representation.upsert({
      where: { hash_processor_version: { hash, processor, version } },
      create: { hash, processor, version, parts },
      update: { parts },
    });
  }
}
