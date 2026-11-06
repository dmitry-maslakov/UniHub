import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { jsonInput } from '../../platform/database/json-input.js';
import { Item, type ItemState } from '../domain/item/item.js';
import type { ItemRepository } from '../domain/item/item.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import {
  LOCK,
  PrismaIngestedRepository,
} from './prisma-ingested.repository.js';
import { itemValues, ofRecord, sharedSight } from './rows.js';

const include = {
  sights: { where: sharedSight, select: { hiddenFrom: true } },
} satisfies Prisma.ItemVersionInclude;

const toItem = (
  ref: PortalRef,
  row: Prisma.ItemVersionGetPayload<{ include: typeof include }>,
) =>
  Item.restore({
    id: row.id,
    ref,
    props: {
      kind: row.kind,
      title: row.title,
      url: row.url,
      publishedAt: row.publishedAt,
      ...itemValues(row),
    },
    portalCourseId: row.portalCourseId,
    removedAt: row.sights[0].hiddenFrom,
  });

@Injectable()
export class PrismaItemRepository
  extends PrismaIngestedRepository<Item>
  implements ItemRepository
{
  protected readonly lock = LOCK.item;

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.itemVersion.findFirst({
      where: { item: ofRecord(ref), sights: { some: sharedSight } },
      include,
    });
    return row && toItem(ref, row);
  }

  protected async upsert({
    id,
    ref,
    props,
    portalCourseId,
    removedAt,
  }: Readonly<ItemState>) {
    const { tx } = this.txHost;
    await tx.item.createMany({
      data: { id, ...ofRecord(ref) },
      skipDuplicates: true,
    });
    const data = { ...props, raw: jsonInput(props.raw), portalCourseId };
    await tx.itemVersion.upsert({
      where: { id },
      create: { id, itemId: id, ...data },
      update: data,
    });
    await tx.itemSight.upsert(this.sight(id, removedAt));
  }
}
