import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { PluginCatalog } from '../../../plugins/contracts.js';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  GetPageTextsQuery,
  GetTextPageQuery,
  ListTextsQuery,
  type TextInfo,
  type TextPage,
} from '../../application/queries.js';

// In sql, so only the counts and the one page leave the database. The
// processor's name was checked on the way in, it's read back as one. Only
// the texts of the processors on: one turned off keeps its texts, unread.
// A representation with no parts (a processor found nothing to read) is
// stored, so it isn't made again, but it is no text: it's left out.

@QueryHandler(ListTextsQuery)
export class ListTextsHandler implements IQueryHandler<ListTextsQuery> {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly plugins: PluginCatalog,
  ) {}

  // the newest version of each processor is the one that counts, even when
  // it's the one with no parts
  execute({ hash }: ListTextsQuery) {
    return this.txHost.tx.$queryRaw<TextInfo[]>`
      SELECT processor, version, pages FROM (
        SELECT DISTINCT ON (processor)
          processor, version, jsonb_array_length(parts)::int AS pages,
          length(parts::text) AS size
        FROM "Representation"
        WHERE hash = ${hash}
          AND processor = ANY(${this.plugins.processorNames}::text[])
        ORDER BY processor, version DESC
      ) newest
      WHERE pages > 0
      ORDER BY size DESC, processor`;
  }
}

// One page of the newest version of each processor's text (or of the one
// named), for those that have the page, the longest first.
function pageTexts(
  txHost: PrismaTxHost,
  names: readonly string[],
  hash: string,
  page: number,
  processor: string | null,
) {
  return txHost.tx.$queryRaw<TextPage[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (processor)
        processor, version, jsonb_array_length(parts)::int AS pages,
        ${page}::int AS page, parts ->> ${page - 1}::int AS text
      FROM "Representation"
      WHERE hash = ${hash}
        AND processor = ANY(${names}::text[])
        AND (${processor}::text IS NULL OR processor = ${processor})
      ORDER BY processor, version DESC
    ) newest
    WHERE text IS NOT NULL
    ORDER BY length(text) DESC, processor`;
}

@QueryHandler(GetTextPageQuery)
export class GetTextPageHandler implements IQueryHandler<GetTextPageQuery> {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly plugins: PluginCatalog,
  ) {}

  async execute({ hash, page, processor }: GetTextPageQuery) {
    if (!Number.isInteger(page) || page < 1) return null;
    const [found] = await pageTexts(
      this.txHost,
      this.plugins.processorNames,
      hash,
      page,
      processor ?? null,
    );
    return found ?? null;
  }
}

@QueryHandler(GetPageTextsQuery)
export class GetPageTextsHandler implements IQueryHandler<GetPageTextsQuery> {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly plugins: PluginCatalog,
  ) {}

  async execute({ hash, page }: GetPageTextsQuery) {
    if (!Number.isInteger(page) || page < 1) return [];
    return pageTexts(
      this.txHost,
      this.plugins.processorNames,
      hash,
      page,
      null,
    );
  }
}
