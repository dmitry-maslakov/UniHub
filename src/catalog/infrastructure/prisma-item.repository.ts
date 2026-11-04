import { Injectable } from '@nestjs/common';
import type { Json, PortalId } from '@app/kernel';
import { Prisma, type Item as Row } from '../../generated/prisma/client.js';
import { Item, type ItemState } from '../domain/item/item.js';
import type { ItemRepository } from '../domain/item/item.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import {
  LOCK,
  PrismaIngestedRepository,
} from './prisma-ingested.repository.js';
import { byPortalRef } from './rows.js';

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
export class PrismaItemRepository
  extends PrismaIngestedRepository<Item>
  implements ItemRepository
{
  protected readonly lock = LOCK.item;

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.item.findUnique({
      where: byPortalRef(ref),
    });
    return row && toItem(row);
  }

  protected upsert({
    id,
    ref,
    props,
    portalCourseId,
    removedAt,
  }: Readonly<ItemState>) {
    const data = {
      portal: ref.portal,
      externalId: ref.externalId,
      ...props,
      raw: toJsonInput(props.raw),
      portalCourseId,
      removedAt,
    };
    return this.txHost.tx.item.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
}
