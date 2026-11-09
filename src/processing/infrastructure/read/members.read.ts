import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ContentHash, MediaType } from '@app/kernel';
import { PluginCatalog } from '../../../plugins/contracts.js';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  FindMemberQuery,
  ListContainedQuery,
  ListMembersQuery,
  type ContainedMember,
  type MemberInfo,
} from '../../application/queries.js';

// The trees as UnpackContent saved them: paths, media types and reasons
// were checked on the way in, sizes went in as safe integers. A member's
// texts are those of the processors on, as a file's are (texts.read.ts).

// In sql, each member with the newest text of each processor (as
// ListTextsHandler counts them), so only the page of the tree leaves the
// database.
@QueryHandler(ListMembersQuery)
export class ListMembersHandler implements IQueryHandler<ListMembersQuery> {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly plugins: PluginCatalog,
  ) {}

  execute({ hash, offset, limit }: ListMembersQuery) {
    return this.txHost.tx.$queryRaw<MemberInfo[]>`
      SELECT m.path, m.size::float8 AS size, m.mime, m."leftOut",
        COALESCE(t.texts, '[]') AS texts
      FROM "Member" m
      LEFT JOIN LATERAL (
        SELECT json_agg(newest ORDER BY newest.processor) AS texts
        FROM (
          SELECT DISTINCT ON (processor)
            processor, version, jsonb_array_length(parts)::int AS pages
          FROM "Representation"
          WHERE hash = m.content
            AND processor = ANY(${this.plugins.processorNames}::text[])
          ORDER BY processor, version DESC
        ) newest
        WHERE newest.pages > 0
      ) t ON true
      WHERE m.hash = ${hash}
      ORDER BY m.position
      OFFSET ${offset} LIMIT ${limit}`;
  }
}

@QueryHandler(FindMemberQuery)
export class FindMemberHandler implements IQueryHandler<FindMemberQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ hash, path }: FindMemberQuery) {
    // kept: one of a path, a second one listed without its content
    const member = await this.txHost.tx.member.findFirst({
      where: { hash, path, content: { not: null } },
      select: { content: true, mime: true, size: true },
    });
    return member
      ? {
          hash: member.content as ContentHash,
          mime: member.mime as MediaType | null,
          size: member.size === null ? null : Number(member.size),
        }
      : null;
  }
}

@QueryHandler(ListContainedQuery)
export class ListContainedHandler implements IQueryHandler<ListContainedQuery> {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly plugins: PluginCatalog,
  ) {}

  execute({ hashes }: ListContainedQuery) {
    return this.txHost.tx.$queryRaw<ContainedMember[]>`
      SELECT m.hash AS container, m.path, m.content AS hash
      FROM "Member" m
      WHERE m.hash = ANY(${hashes}::text[])
        AND m.content IS NOT NULL
        AND EXISTS (
          SELECT FROM "Representation" r
          WHERE r.hash = m.content
            AND r.processor = ANY(${this.plugins.processorNames}::text[])
            AND jsonb_array_length(r.parts) > 0
        )
      ORDER BY m.hash, m.position`;
  }
}
