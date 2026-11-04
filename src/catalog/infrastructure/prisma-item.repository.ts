import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import type { Json, PortalId } from '@app/kernel';
import { Prisma, type Item as Row } from '../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { Item } from '../domain/item/item.js';
import { ItemRepository } from '../domain/item/item.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import { byPortalRef } from './by-portal-ref.js';
import { CatalogOutbox } from './catalog-outbox.js';
import { LOCK, lockRecord } from './record-lock.js';

const toItem = (row: Row) =>
  Item.restore({
    id: row.id,
    ref: { portal: row.portal as PortalId, externalId: row.externalId },
    props: {
      kind: row.kind,
      title: row.title,
      url: row.url,
      publishedAt: row.publishedAt,
      raw: row.raw as Json,
    },
    portalCourseId: row.portalCourseId,
    removedAt: row.removedAt,
  });

// a bare null is json too, but Prisma takes it only as JsonNull
const toJsonInput = (value: Json) =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

@Injectable()
export class PrismaItemRepository extends ItemRepository {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly outbox: CatalogOutbox,
  ) {
    super();
  }

  @Transactional(Propagation.Mandatory)
  async getForUpdate(ref: PortalRef) {
    await lockRecord(this.txHost.tx, LOCK.item, ref);
    return this.findByRef(ref);
  }

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.item.findUnique({
      where: byPortalRef(ref),
    });
    return row && toItem(row);
  }

  @Transactional(Propagation.Mandatory)
  async save(item: Item) {
    if (item.dirty) {
      const { id, ref, props, portalCourseId, removedAt } = item.snapshot;
      const data = {
        portal: ref.portal,
        externalId: ref.externalId,
        ...props,
        raw: toJsonInput(props.raw),
        portalCourseId,
        removedAt,
      };
      await this.txHost.tx.item.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
    await this.outbox.write(item);
  }
}
