import { Query } from '@nestjs/cqrs';
import type { ContentHash, Json, MediaType, PortalId } from '@app/kernel';
import type { PortalRef } from '../domain/portal-ref.js';

// What other modules read from catalog: shapes of their own, so catalog's
// records can change without breaking them. Read straight from the database
// (infrastructure/read), past the aggregates.

export interface CourseRef {
  id: string;
  slug: string;
  name: string;
}

export interface CourseDto extends CourseRef {
  // by year, the ones that span years last
  portalCourses: {
    id: string;
    portal: PortalId;
    externalId: string;
    name: string;
    year: number | null;
  }[];
}

export interface PortalCourseDto {
  id: string;
  portal: PortalId;
  externalId: string;
  name: string;
  url: string | null;
  meta: Json | null;
}

export interface ItemDto {
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
  // when the hub last changed it: its record, or its removal
  updatedAt: Date;
}

// an item that isn't removed, by when the hub last changed it
export interface ItemStampDto {
  id: string;
  updatedAt: Date;
}

export interface FileDto {
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

// a file as a course shows it, and that course
export interface CourseFileDto extends FileDto {
  courseId: string;
}

// a post as a course shows it, and that course
export interface CourseItemDto extends ItemDto {
  courseId: string;
}

// a post a course shows, as search answers it
export interface VisibleItemDto {
  itemId: string;
  courseId: string;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
}

// a file a course shows, by its content
export interface VisibleContentDto {
  fileId: string;
  courseId: string;
  hash: ContentHash;
  name: string;
  path: string;
}

export class ListCoursesQuery extends Query<CourseDto[]> {}

// by its slug, or by the id catalog gave it
export class FindCourseQuery extends Query<CourseRef | null> {
  constructor(public readonly by: { slug: string } | { id: string }) {
    super();
  }
}

// what the course's portals published, newest first, the ones a course
// shows (see GetCourseItemQuery)
export class ListCourseItemsQuery extends Query<ItemDto[]> {
  constructor(
    public readonly courseId: string,
    public readonly offset: number,
    public readonly limit: number,
  ) {
    super();
  }
}

// the course's files by folder and name, the ones a course shows (see
// GetCourseFileQuery)
export class ListCourseFilesQuery extends Query<FileDto[]> {
  constructor(
    public readonly courseId: string,
    public readonly offset: number,
    public readonly limit: number,
  ) {
    super();
  }
}

// A file and its course, if a course shows it: not removed, not attached to
// a removed post, in a portal course linked to a course. Null otherwise.
export class GetCourseFileQuery extends Query<CourseFileDto | null> {
  constructor(public readonly fileId: string) {
    super();
  }
}

// the files these courses show (see GetCourseFileQuery) that have content,
// by folder and name: what search may look through
export class ListVisibleContentQuery extends Query<VisibleContentDto[]> {
  constructor(public readonly courseIds: readonly string[]) {
    super();
  }
}

// A post and its course, if a course shows it: not removed, in a portal
// course linked to a course. Null otherwise.
export class GetCourseItemQuery extends Query<CourseItemDto | null> {
  constructor(public readonly itemId: string) {
    super();
  }
}

// the posts these courses show (see GetCourseItemQuery): what search may
// look through
export class ListVisibleItemsQuery extends Query<VisibleItemDto[]> {
  constructor(public readonly courseIds: readonly string[]) {
    super();
  }
}

// The ones below are for plugins and processing, and find removed records
// too (with `removed` set): a version is removed once no account sees it.
// A post or a file by its version's id, as catalog's events name it (the
// record's own id, for the shared account's version); a portal course by
// its own id, as the shared account sees it.

export class GetPortalCourseQuery extends Query<PortalCourseDto | null> {
  constructor(public readonly id: string) {
    super();
  }
}

export class GetItemQuery extends Query<ItemDto | null> {
  constructor(public readonly id: string) {
    super();
  }
}

export class GetFileQuery extends Query<FileDto | null> {
  constructor(public readonly id: string) {
    super();
  }
}

// by the portal's id, as the shared account sees it
export class FindFileQuery extends Query<FileDto | null> {
  constructor(public readonly file: PortalRef) {
    super();
  }
}

// the files that hold this content and aren't removed
export class ListFilesOfContentQuery extends Query<FileDto[]> {
  constructor(public readonly hash: ContentHash) {
    super();
  }
}

// a page of items that aren't removed, by id, after the given one: for
// walking all of them without their records
export class ListItemsQuery extends Query<ItemStampDto[]> {
  constructor(
    public readonly after: string | null,
    public readonly limit: number,
  ) {
    super();
  }
}

// a page of files that have content and aren't removed, by id, after the
// given one: for walking all of them
export class ListFilesWithContentQuery extends Query<FileDto[]> {
  constructor(
    public readonly after: string | null,
    public readonly limit: number,
  ) {
    super();
  }
}
