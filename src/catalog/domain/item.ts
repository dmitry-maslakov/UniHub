import type { Json, Upserted } from './changes.js';

// anything a portal publishes that isn't a file: posts, announcements, pages...
export interface Item {
  id: string;
  portal: string;
  externalId: string;
  portalCourseId: string | null;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
}

type Optional = 'portalCourseId' | 'title' | 'url' | 'publishedAt';

export type ItemData = Omit<Item, 'id' | Optional> &
  Partial<Pick<Item, Optional>>;

export abstract class ItemRepository {
  abstract upsert(data: ItemData): Promise<Upserted<Item>>;
  abstract findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<Item | null>;
}
