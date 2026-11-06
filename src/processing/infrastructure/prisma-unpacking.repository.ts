import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ContentHash, MediaType } from '@app/kernel';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  UnpackingRepository,
  type LeftOut,
  type Made,
  type Unpacking,
} from '../domain/unpacking.js';

// trees() reads this many at a time
const PAGE = 1000;

// Keys, hashes, media types and reasons were checked on the way in, they're
// read back as them; sizes went in as safe integers, they come back as numbers.
@Injectable()
export class PrismaUnpackingRepository extends UnpackingRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async current(hash: ContentHash) {
    const row = await this.txHost.tx.unpacking.findUnique({
      where: { hash },
      include: { members: { orderBy: { position: 'asc' } } },
    });
    if (!row) return null;
    const { members, updatedAt: _, ...tree } = row;
    return {
      ...tree,
      members: members.map(({ path, content, size, mime, leftOut }) => ({
        path,
        hash: content as ContentHash | null,
        size: size === null ? null : Number(size),
        mime: mime as MediaType | null,
        leftOut: leftOut as LeftOut | null,
      })),
    } as Unpacking;
  }

  // one write, so its nested ones are one transaction
  async save({ members, ...tree }: Unpacking) {
    const rows = members.map(
      ({ path, hash, size, mime, leftOut }, position) => ({
        position,
        path,
        content: hash,
        size,
        mime,
        leftOut,
      }),
    );
    await this.txHost.tx.unpacking.upsert({
      where: { hash: tree.hash },
      create: { ...tree, members: { createMany: { data: rows } } },
      update: {
        ...tree,
        members: { deleteMany: {}, createMany: { data: rows } },
      },
    });
  }

  // a page at a time, after the last hash of the page before
  async *trees() {
    let after = '';
    for (;;) {
      const page = await this.txHost.tx.unpacking.findMany({
        where: { hash: { gt: after } },
        orderBy: { hash: 'asc' },
        take: PAGE,
        select: { hash: true, unpacker: true, version: true, policy: true },
      });
      yield* page as Made[];
      if (page.length < PAGE) return;
      after = page[page.length - 1].hash;
    }
  }

  async holding(hash: ContentHash) {
    const rows = await this.txHost.tx.member.findMany({
      where: { content: hash },
      select: { hash: true, path: true, mime: true },
    });
    return rows.map(({ hash: container, path, mime }) => ({
      container: container as ContentHash,
      path,
      mime: mime as MediaType | null,
    }));
  }
}
