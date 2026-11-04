import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  RepresentationRepository,
  type Representation,
  type TextInfo,
} from '../domain/representation.js';

@Injectable()
export class PrismaRepresentationRepository extends RepresentationRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async exists(hash: string, processor: string, version: number) {
    const row = await this.txHost.tx.representation.findUnique({
      where: { hash_processor_version: { hash, processor, version } },
      select: { hash: true },
    });
    return row !== null;
  }

  // in sql, so only the counts and the one page leave the database
  async texts(hash: string) {
    return this.txHost.tx.$queryRaw<TextInfo[]>`
      SELECT DISTINCT ON (processor)
        processor, version, jsonb_array_length(parts)::int AS pages
      FROM "Representation"
      WHERE hash = ${hash}
      ORDER BY processor, version DESC`;
  }

  async page(hash: string, page: number, processor?: string) {
    const [found] = await this.txHost.tx.$queryRaw<
      {
        processor: string;
        version: number;
        pages: number;
        text: string | null;
      }[]
    >`
      SELECT processor, version, jsonb_array_length(parts)::int AS pages,
        parts ->> ${page - 1}::int AS text
      FROM "Representation"
      WHERE hash = ${hash}
        AND (${processor ?? null}::text IS NULL OR processor = ${processor ?? null})
      ORDER BY processor, version DESC
      LIMIT 1`;
    if (!found || found.text === null) return null;
    return { ...found, page, text: found.text };
  }

  async save({ hash, processor, version, parts }: Representation) {
    await this.txHost.tx.representation.upsert({
      where: { hash_processor_version: { hash, processor, version } },
      create: { hash, processor, version, parts },
      update: { parts },
    });
  }
}
