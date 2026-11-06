import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  GetItemQuery,
  ListItemsQuery,
  type ItemDto,
} from '../../catalog/contracts.js';
import { PostFacts } from '../application/ports.js';

const PAGE = 500;

const postOf = ({ title, raw }: ItemDto) => ({ title, raw });

@Injectable()
export class CatalogPostFacts extends PostFacts {
  constructor(private readonly queries: QueryBus) {
    super();
  }

  async post(id: string) {
    const item = await this.queries.execute(new GetItemQuery(id));
    // catalog keeps a removed item, marked so
    return item && !item.removed ? postOf(item) : null;
  }

  async *posts() {
    let after: string | null = null;
    for (;;) {
      const items: ItemDto[] = await this.queries.execute(
        new ListItemsQuery(after, PAGE),
      );
      for (const item of items) yield { ...postOf(item), id: item.id };
      if (items.length < PAGE) return;
      after = items[items.length - 1].id;
    }
  }
}
