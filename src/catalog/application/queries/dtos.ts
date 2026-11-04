import type { Json } from '@app/kernel';
import type { File } from '../../domain/file.js';
import type { Item } from '../../domain/item.js';
import type { PortalCourse } from '../../domain/portal-course.js';

// what other modules get from catalog's queries, copied field by field so
// catalog's entities can change without breaking them

export interface PortalCourseDto {
  id: string;
  portal: string;
  externalId: string;
  name: string;
  url: string | null;
  meta: Json | null;
}

export interface ItemDto {
  id: string;
  portal: string;
  externalId: string;
  portalCourseId: string | null;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
  removed: boolean;
}

export interface FileDto {
  id: string;
  portal: string;
  externalId: string;
  portalCourseId: string | null;
  itemId: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: string | null;
  contentHash: string | null;
  removed: boolean;
}

export const toPortalCourseDto = (c: PortalCourse): PortalCourseDto => ({
  id: c.id,
  portal: c.portal,
  externalId: c.externalId,
  name: c.name,
  url: c.url,
  meta: c.meta,
});

export const toItemDto = (i: Item): ItemDto => ({
  id: i.id,
  portal: i.portal,
  externalId: i.externalId,
  portalCourseId: i.portalCourseId,
  kind: i.kind,
  title: i.title,
  url: i.url,
  publishedAt: i.publishedAt,
  raw: i.raw,
  removed: i.removedAt !== null,
});

export const toFileDto = (f: File): FileDto => ({
  id: f.id,
  portal: f.portal,
  externalId: f.externalId,
  portalCourseId: f.portalCourseId,
  itemId: f.itemId,
  name: f.name,
  path: f.path,
  url: f.url,
  size: f.size,
  mime: f.mime,
  contentHash: f.contentHash,
  removed: f.removedAt !== null,
});
