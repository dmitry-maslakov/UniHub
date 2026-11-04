import { Injectable } from '@nestjs/common';
import type { Item as Row } from '../../generated/prisma/client.js';
import { jsonInput } from '../../platform/database/json-input.js';
import { Item, type ItemState } from '../domain/item/item.js';
import type { ItemRepository } from '../domain/item/item.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import {
  LOCK,
  PrismaIngestedRepository,
} from './prisma-ingested.repository.js';
import { byPortalRef, itemValues } from './rows.js';

const toItem = (row: Row) => {
  const { portal, raw } = itemValues(row);
  return Item.restore({
    id: row.id,
    ref: { portal, externalId: row.externalId },
    props: {
      kind: row.kind,
      title: row.title,
      url: row.url,
      publishedAt: row.publishedAt,
      raw,
    },
    portalCourseId: row.portalCourseId,
    removedAt: row.removedAt,
  });
};

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
      raw: jsonInput(props.raw),
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
