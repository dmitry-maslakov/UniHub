import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ContentHash } from '@app/kernel';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  ExpansionRepository,
  type Entry,
  type Expansion,
  type ExpansionKey,
} from '../domain/expansion.js';

const byKey = ({ hash, expander, version }: ExpansionKey) => ({
  hash_expander_version: { hash, expander, version },
});

// Keys and entries were checked on the way in, they're read back as them.
@Injectable()
export class PrismaExpansionRepository extends ExpansionRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async exists(key: ExpansionKey) {
    const row = await this.txHost.tx.expansion.findUnique({
      where: byKey(key),
      select: { hash: true },
    });
    return row !== null;
  }

  async find(key: ExpansionKey) {
    const row = await this.txHost.tx.expansion.findUnique({
      where: byKey(key),
      select: { entries: true },
    });
    // save() keeps the entries as a list of { path, hash, size }
    return row && { ...key, entries: row.entries as unknown as Entry[] };
  }

  async newestOf(hashes: readonly ContentHash[]) {
    if (!hashes.length) return [];
    return this.txHost.tx.$queryRaw<Expansion[]>`
      SELECT DISTINCT ON (hash, expander) hash, expander, version, entries
      FROM "Expansion"
      WHERE hash = ANY(${hashes}::text[])
      ORDER BY hash, expander, version DESC`;
  }

  // the newest of each, among those any version of which holds it: the
  // index finds the latter (entries @>)
  async naming(hash: ContentHash) {
    const holding = JSON.stringify([{ hash }]);
    return this.txHost.tx.$queryRaw<Expansion[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (hash, expander) hash, expander, version, entries
        FROM "Expansion"
        WHERE hash IN (
          SELECT hash FROM "Expansion" WHERE entries @> ${holding}::jsonb
        )
        ORDER BY hash, expander, version DESC
      ) newest
      WHERE entries @> ${holding}::jsonb`;
  }

  async save({ entries, ...key }: Expansion) {
    const json = entries.map(({ path, hash, size }) => ({
      path,
      hash: hash as string,
      size,
    }));
    await this.txHost.tx.expansion.upsert({
      where: byKey(key),
      create: { ...key, entries: json },
      update: { entries: json },
    });
  }
}
