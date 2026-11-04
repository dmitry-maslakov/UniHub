import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import { MediaType, type ContentHash, type PortalId } from '@app/kernel';
import type { File as Row } from '../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { PortalFile } from '../domain/portal-file/portal-file.js';
import { PortalFileRepository } from '../domain/portal-file/portal-file.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import { byPortalRef } from './by-portal-ref.js';
import { CatalogOutbox } from './catalog-outbox.js';
import { LOCK, lockRecord } from './record-lock.js';

// Values were checked on the way in. Rows from before media types were
// normalised get theirs read the way they are now written. Size is a bigint
// in the db (files over 2 GB), a number everywhere else.
const toFile = (row: Row) =>
  PortalFile.restore({
    id: row.id,
    ref: { portal: row.portal as PortalId, externalId: row.externalId },
    props: {
      name: row.name,
      path: row.path,
      url: row.url,
      size: row.size === null ? null : Number(row.size),
      mime: MediaType.safeParse(row.mime).data ?? null,
      sourceUpdatedAt: row.sourceUpdatedAt,
    },
    placement: { portalCourseId: row.portalCourseId, itemId: row.itemId },
    content: row.contentHash as ContentHash | null,
    stale: row.contentStale,
    removedAt: row.removedAt,
  });

@Injectable()
export class PrismaPortalFileRepository extends PortalFileRepository {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly outbox: CatalogOutbox,
  ) {
    super();
  }

  @Transactional(Propagation.Mandatory)
  async getForUpdate(ref: PortalRef) {
    await lockRecord(this.txHost.tx, LOCK.file, ref);
    const row = await this.txHost.tx.file.findUnique({
      where: byPortalRef(ref),
    });
    return row && toFile(row);
  }

  @Transactional(Propagation.Mandatory)
  async save(file: PortalFile) {
    if (file.dirty) {
      const { id, ref, props, placement, content, stale, removedAt } =
        file.snapshot;
      const data = {
        portal: ref.portal,
        externalId: ref.externalId,
        ...props,
        ...placement,
        contentHash: content,
        contentStale: stale,
        removedAt,
      };
      await this.txHost.tx.file.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
    await this.outbox.write(file);
  }
}
