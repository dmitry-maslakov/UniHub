import type { Json, MediaType, PortalId } from '@app/kernel';
import type { CourseDto, FileDto, ItemDto } from '../../catalog/contracts.js';
import type { TextInfo } from '../../processing/contracts.js';

// What a user reads, through REST and MCP alike: catalog's records without
// what only the hub needs (portal ids, removal, content hashes).

export interface PortalCourseView {
  portal: PortalId;
  name: string;
  year: number | null;
}

export interface CourseView {
  slug: string;
  name: string;
  portalCourses: PortalCourseView[];
}

export interface ItemView {
  id: string;
  portal: PortalId;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
}

export interface FileView {
  id: string;
  portal: PortalId;
  // the post it came with, if any
  itemId: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: MediaType | null;
  hasContent: boolean;
}

// the file and what processors made of it, without the text
export interface FileDetailsView extends FileView {
  texts: TextInfo[];
}

export const courseView = ({
  slug,
  name,
  portalCourses,
}: CourseDto): CourseView => ({
  slug,
  name,
  portalCourses: portalCourses.map(({ portal, name, year }) => ({
    portal,
    name,
    year,
  })),
});

export const itemView = ({
  id,
  portal,
  kind,
  title,
  url,
  publishedAt,
  raw,
}: ItemDto): ItemView => ({ id, portal, kind, title, url, publishedAt, raw });

export const fileView = ({
  id,
  portal,
  itemId,
  name,
  path,
  url,
  size,
  mime,
  contentHash,
}: FileDto): FileView => ({
  id,
  portal,
  itemId,
  name,
  path,
  url,
  size,
  mime,
  hasContent: contentHash !== null,
});
