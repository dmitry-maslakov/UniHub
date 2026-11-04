// What a plugin sends to the hub. Ids are the portal's own, the hub maps them
// to its ids. Only `externalId` and the fields without `?` are required.
// A record describes the object as everyone sees it: no per-user data
// (grades, submissions, personal due dates) in it or in `raw`.

import type { Json } from '@app/kernel';

export type { Json };

export interface CourseRecord {
  externalId: string;
  name: string;
  url?: string;
  meta?: Json;
}

// a post, announcement, page... anything that isn't a file
export interface ItemRecord {
  externalId: string;
  // externalId of the course it belongs to, if any
  course?: string;
  kind: string;
  title?: string;
  url?: string;
  publishedAt?: Date;
  // whatever the portal returned, kept as is
  raw: Json;
}

export interface FileRecord {
  externalId: string;
  course?: string;
  // externalId of the item it is attached to, if any
  item?: string;
  name: string;
  // folder inside the portal, e.g. "Lectures/2026"
  path?: string;
  url?: string;
  size?: number;
  mime?: string;
  updatedAt?: Date;
}
