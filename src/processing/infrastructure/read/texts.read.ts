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

type PageRow = Omit<TextPage, 'text'> & {
  text: string | null;
  // of the whole text, to tell which is the document's main one
  size: number;
};

// The newest version of each processor on (or of the one named) that has
// parts, with its page `page` (null where it has no such page), the longest
// first and those without last.
function pageRows(
  txHost: PrismaTxHost,
  names: readonly string[],
  hash: string,
  page: number,
  processor: string | null,
) {
  return txHost.tx.$queryRaw<PageRow[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (processor)
        processor, version, jsonb_array_length(parts)::int AS pages,
        ${page}::int AS page, parts ->> ${page - 1}::int AS text,
        length(parts::text)::int AS size
      FROM "Representation"
      WHERE hash = ${hash}
        AND processor = ANY(${names}::text[])
        AND (${processor}::text IS NULL OR processor = ${processor})
      ORDER BY processor, version DESC
    ) newest
    WHERE pages > 0
    ORDER BY length(text) DESC NULLS LAST, processor`;
}

// the page as it's read, once it's known to be there
const asPage = ({ size: _size, text, ...row }: PageRow): TextPage | null =>
  text === null ? null : { ...row, text };

@QueryHandler(GetTextPageQuery)
export class GetTextPageHandler implements IQueryHandler<GetTextPageQuery> {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly plugins: PluginCatalog,
  ) {}

  // With a processor named, its page. Otherwise the longest text of the page,
  // when the texts are split alike. Texts with different numbers of pages
  // are of documents split differently (an html a portal calls text/plain),
  // and page 3 of one isn't page 3 of the other: then only the largest text
  // answers, null if it has no such page. By size, not pages: a pdf whose
  // pages two parsers count differently must still be read by its main text.
  async execute({ hash, page, processor }: GetTextPageQuery) {
    if (!Number.isInteger(page) || page < 1) return null;
    const rows = await pageRows(
      this.txHost,
      this.plugins.processorNames,
      hash,
      page,
      processor ?? null,
    );
    const alike = new Set(rows.map((row) => row.pages)).size <= 1;
    const found = alike
      ? rows[0]
      : rows.reduce((largest, row) =>
          row.size > largest.size ? row : largest,
        );
    return found ? asPage(found) : null;
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
    const rows = await pageRows(
      this.txHost,
      this.plugins.processorNames,
      hash,
      page,
      null,
    );
    return rows.flatMap((row) => asPage(row) ?? []);
  }
}
