import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ContentHash, PluginName } from '@app/kernel';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import { TextReads } from '../../application/ports.js';
import type { StoredText } from '../../domain/content-texts.js';

// In sql, so only the counts and the one page leave the database. The keys
// were checked on the way in, they're read back as them.
@Injectable()
export class PrismaTextReads extends TextReads {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async newest(hashes: readonly ContentHash[]) {
    if (!hashes.length) return [];
    return this.txHost.tx.$queryRaw<StoredText[]>`
      SELECT DISTINCT ON (hash, processor)
        hash, processor, version, jsonb_array_length(parts)::int AS pages
      FROM "Representation"
      WHERE hash = ANY(${[...new Set(hashes)]}::text[])
      ORDER BY hash, processor, version DESC`;
  }

  async page(hash: ContentHash, processor: PluginName, page: number) {
    const [found] = await this.txHost.tx.$queryRaw<{ text: string | null }[]>`
      SELECT parts ->> ${page - 1}::int AS text
      FROM "Representation"
      WHERE hash = ${hash} AND processor = ${processor}
      ORDER BY version DESC
      LIMIT 1`;
    return found?.text ?? null;
  }
}
