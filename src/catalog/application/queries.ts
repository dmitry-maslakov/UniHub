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

export class ListCoursesQuery extends Query<CourseDto[]> {}

// by slug
export class FindCourseQuery extends Query<CourseRef | null> {
  constructor(public readonly slug: string) {
    super();
  }
}

// what the course's portals published, newest first, skipping removed ones
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

// The ones below are for plugins and processing, and find removed records
// too (with `removed` set).

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

// by the portal's id
export class FindFileQuery extends Query<FileDto | null> {
  constructor(public readonly file: PortalRef) {
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
