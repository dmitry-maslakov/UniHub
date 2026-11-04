import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  GetTextPageQuery,
  ListTextsQuery,
  type TextInfo,
} from '../../application/queries.js';

// In sql, so only the counts and the one page leave the database. The
// processor's name was checked on the way in, it's read back as one.

@QueryHandler(ListTextsQuery)
export class ListTextsHandler implements IQueryHandler<ListTextsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  execute({ hash }: ListTextsQuery) {
    return this.txHost.tx.$queryRaw<TextInfo[]>`
      SELECT DISTINCT ON (processor)
        processor, version, jsonb_array_length(parts)::int AS pages
      FROM "Representation"
      WHERE hash = ${hash}
      ORDER BY processor, version DESC`;
  }
}

@QueryHandler(GetTextPageQuery)
export class GetTextPageHandler implements IQueryHandler<GetTextPageQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ hash, page, processor }: GetTextPageQuery) {
    if (!Number.isInteger(page) || page < 1) return null;
    const [found] = await this.txHost.tx.$queryRaw<
      (TextInfo & { text: string | null })[]
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
}
