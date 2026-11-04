import type { CourseView, FileView, ItemView } from '@app/plugin-sdk';
import type {
  FileDto,
  ItemDto,
  PortalCourseDto,
} from '../../../catalog/contracts.js';

// Copied field by field, so a field added to catalog's dtos doesn't reach
// plugins without the sdk saying so.

export const courseView = (c: PortalCourseDto): CourseView => ({
  id: c.id,
  portal: c.portal,
  externalId: c.externalId,
  name: c.name,
  url: c.url,
  meta: c.meta,
});

export const itemView = (i: ItemDto): ItemView => ({
  id: i.id,
  portal: i.portal,
  externalId: i.externalId,
  portalCourseId: i.portalCourseId,
  kind: i.kind,
  title: i.title,
  url: i.url,
  publishedAt: i.publishedAt,
  raw: i.raw,
  removed: i.removed,
});

export const fileView = (f: FileDto): FileView => ({
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
  removed: f.removed,
});
