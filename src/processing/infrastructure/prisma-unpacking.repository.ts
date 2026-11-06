import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ContentHash, MediaType } from '@app/kernel';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  UnpackingRepository,
  type LeftOut,
  type Unpacking,
} from '../domain/unpacking.js';

// Keys, hashes, media types and reasons were checked on the way in, they're
// read back as them.
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
    const { members, createdAt: _, ...tree } = row;
    return {
      ...tree,
      members: members.map(({ path, content, size, mime, leftOut }) => ({
        path,
        hash: content as ContentHash | null,
        size,
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
