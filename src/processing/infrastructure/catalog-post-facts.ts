import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  GetItemQuery,
  ListItemsQuery,
  type ItemStampDto,
} from '../../catalog/contracts.js';
import { PostFacts } from '../application/ports.js';

const PAGE = 1000;

@Injectable()
export class CatalogPostFacts extends PostFacts {
  constructor(private readonly queries: QueryBus) {
    super();
  }

  async post(id: string) {
    const item = await this.queries.execute(new GetItemQuery(id));
    // catalog keeps a removed item, marked so
    if (!item || item.removed) return null;
    const { title, raw, updatedAt } = item;
    return { title, raw, updatedAt };
  }

  async *posts() {
    let after: string | null = null;
    for (;;) {
      const items: ItemStampDto[] = await this.queries.execute(
        new ListItemsQuery(after, PAGE),
      );
      yield* items;
      if (items.length < PAGE) return;
      after = items[items.length - 1].id;
    }
  }
}
