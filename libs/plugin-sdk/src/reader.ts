import type { Readable } from 'node:stream';
import type { ContentHash, Json, MediaType, PortalId } from '@app/kernel';

// Reading what the hub has, by the hub's ids from messages.

export interface CourseView {
  id: string;
  portal: PortalId;
  externalId: string;
  name: string;
  url: string | null;
  meta: Json | null;
}

export interface ItemView {
  id: string;
  portal: PortalId;
  externalId: string;
  portalCourseId: string | null;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
  removed: boolean;
}

export interface FileView {
  id: string;
  portal: PortalId;
  externalId: string;
  portalCourseId: string | null;
  itemId: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: MediaType | null;
  contentHash: ContentHash | null;
  removed: boolean;
}

// provided by the hub, inject it in a plugin
export abstract class HubReader {
  abstract course(id: string): Promise<CourseView | null>;
  abstract item(id: string): Promise<ItemView | null>;
  abstract file(id: string): Promise<FileView | null>;
  abstract content(hash: ContentHash): Promise<Readable>;
}
