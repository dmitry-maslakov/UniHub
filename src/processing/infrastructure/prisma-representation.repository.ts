import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ContentHash, PluginName } from '@app/kernel';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  RepresentationRepository,
  type Representation,
  type RepresentationKey,
} from '../domain/representation.js';

const byKey = ({ hash, processor, version }: RepresentationKey) => ({
  hash_processor_version: { hash, processor, version },
});

// newestKeys() reads this many at a time
const PAGE = 1000;

@Injectable()
export class PrismaRepresentationRepository extends RepresentationRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async exists(key: RepresentationKey) {
    const row = await this.txHost.tx.representation.findUnique({
      where: byKey(key),
      select: { hash: true },
    });
    return row !== null;
  }

  async keysOf(hashes: readonly ContentHash[]) {
    // keys were checked on the way in, they're read back as them
    return (await this.txHost.tx.representation.findMany({
      where: { hash: { in: [...hashes] } },
      select: { hash: true, processor: true, version: true },
    })) as RepresentationKey[];
  }

  // newest as texts.read.ts reads it: the highest version
  async newest(hash: ContentHash, processor: PluginName) {
    const row = await this.txHost.tx.representation.findFirst({
      where: { hash, processor },
      orderBy: { version: 'desc' },
      select: { version: true, parts: true },
    });
    // save() keeps the parts as a list of strings
    return row && { hash, processor, ...row, parts: row.parts as string[] };
  }

  // A page at a time, after the last (hash, processor) of the page before.
  // Keys were checked on the way in, they're read back as them.
  async *newestKeys() {
    let after = { hash: '', processor: '' };
    for (;;) {
      const page = await this.txHost.tx.$queryRaw<RepresentationKey[]>`
        SELECT DISTINCT ON (hash, processor) hash, processor, version
        FROM "Representation"
        WHERE (hash, processor) > (${after.hash}, ${after.processor})
        ORDER BY hash, processor, version DESC
        LIMIT ${PAGE}`;
      yield* page;
      if (page.length < PAGE) return;
      after = page[page.length - 1];
    }
  }

  async save({ parts, ...key }: Representation) {
    await this.txHost.tx.representation.upsert({
      where: byKey(key),
      create: { ...key, parts },
      update: { parts },
    });
  }
}
