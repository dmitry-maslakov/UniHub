import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { ContentHash } from '@app/kernel';
import {
  contentTexts,
  headed,
  locate,
  type Member,
} from '../domain/content-texts.js';
import { ContentMembers } from './content-members.js';
import { TextReads } from './ports.js';
import { GetTextPageQuery, ListTextsQuery, type TextPage } from './queries.js';

// A content's texts, an archive's of its entries too (content-texts.ts).

async function textsOf(
  members: ContentMembers,
  reads: TextReads,
  hash: ContentHash,
) {
  const of: Member[] = (await members.of([hash])).get(hash)!;
  return contentTexts(of, await reads.newest(of.map((m) => m.hash)));
}

@QueryHandler(ListTextsQuery)
export class ListTexts implements IQueryHandler<ListTextsQuery> {
  constructor(
    private readonly members: ContentMembers,
    private readonly reads: TextReads,
  ) {}

  async execute({ hash }: ListTextsQuery) {
    return (await textsOf(this.members, this.reads, hash)).map(
      ({ processor, version, pages }) => ({ processor, version, pages }),
    );
  }
}

@QueryHandler(GetTextPageQuery)
export class GetTextPage implements IQueryHandler<GetTextPageQuery> {
  constructor(
    private readonly members: ContentMembers,
    private readonly reads: TextReads,
  ) {}

  async execute({
    hash,
    page,
    processor,
  }: GetTextPageQuery): Promise<TextPage | null> {
    if (!Number.isInteger(page) || page < 1) return null;
    const texts = await textsOf(this.members, this.reads, hash);
    const text = processor
      ? texts.find((t) => t.processor === processor)
      : texts[0];
    const at = text && locate(text, page);
    if (!at) return null;
    const found = await this.reads.page(
      at.part.member.hash,
      text.processor,
      at.page,
    );
    if (found === null) return null;
    return {
      processor: text.processor,
      version: at.part.version,
      pages: text.pages,
      page,
      text: headed(at.part.member, found),
    };
  }
}
