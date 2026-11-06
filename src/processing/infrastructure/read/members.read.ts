import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ContentHash, MediaType } from '@app/kernel';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  FindMemberQuery,
  ListMembersQuery,
  type MemberInfo,
} from '../../application/queries.js';

// The trees as UnpackContent saved them: paths, media types and reasons
// were checked on the way in, sizes went in as safe integers.

// In sql, each member with the newest text of each processor (as
// ListTextsHandler counts them), so only the page of the tree leaves the
// database.
@QueryHandler(ListMembersQuery)
export class ListMembersHandler implements IQueryHandler<ListMembersQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

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
          ORDER BY processor, version DESC
        ) newest
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
      select: { content: true, mime: true },
    });
    return member
      ? {
          hash: member.content as ContentHash,
          mime: member.mime as MediaType | null,
        }
      : null;
  }
}
