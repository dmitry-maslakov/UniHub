import type { Json } from '@app/kernel';
import type { Upserted } from './changes.js';

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
  // the portal said it's gone; sending it again clears this
  removedAt: Date | null;
}

export type ItemData = Omit<Item, 'id'>;

export abstract class ItemRepository {
  abstract upsert(data: ItemData): Promise<Upserted<Item>>;
  abstract findById(id: string): Promise<Item | null>;
  // not removed, in the course's linked portal courses, newest first
  abstract listOfCourse(
    courseId: string,
    offset: number,
    limit: number,
  ): Promise<Item[]>;
  abstract findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<Item | null>;
  // null if there is no such item
  abstract markRemoved(
    portal: string,
    externalId: string,
  ): Promise<{ id: string; changed: boolean } | null>;
}
