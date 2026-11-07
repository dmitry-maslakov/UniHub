import { Query } from '@nestjs/cqrs';
import type {
  ContentHash,
  Instance,
  Json,
  MediaType,
  PortalId,
} from '@app/kernel';
import type { PortalRef } from '../domain/portal-ref.js';
import type { CourseSlug } from '../domain/values.js';
import type { Stamp } from '../domain/view/view.repository.js';

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
    // its name and address as the viewers see it
    name: string;
    url: string | null;
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

// a course of a portal's catalog, as the shared account sees it now, and
// since when (the first time it sent it)
export interface CatalogCourseDto {
  id: string;
  externalId: string;
  name: string;
  url: string | null;
  since: Date;
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

// a file as a course shows it, and that course (ListCoursesQuery's id)
export interface CourseFileDto extends FileDto {
  courseId: string;
}

// A post as the viewers read it: listed once their view shows it, its
// body (`raw`) only once it opens it too (not locked for their account,
// past its hold), as a file's content is
export interface ViewedItemDto extends Omit<ItemDto, 'raw'> {
  raw: Json | null;
}

// a post as a course shows it, and that course
export interface CourseItemDto extends ViewedItemDto {
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

// a file a course shows, by its content, and the portal course it's in
export interface VisibleContentDto {
  fileId: string;
  courseId: string;
  portalCourseId: string;
  hash: ContentHash;
  name: string;
  path: string;
}

// Whose views a user reads (access works it out, README: Portal accounts).
// In the portals read as shared, all but `except`, the shared account's,
// of the courses granted them (`courses`, null for every one); in the
// public ones (`picks.portals`), the shared account's too, of the portal
// courses the user picked (`picks.courses`); in the others, what their own
// `accounts` see, whole, linked to a course or not. A reader query finds
// only what these see now, and a file's content only once their view
// opens it.
export interface Viewers {
  accounts: readonly string[];
  shared: { courses: readonly string[] | null; except: readonly PortalId[] };
  picks: { portals: readonly PortalId[]; courses: readonly string[] };
}

// The courses the viewers read, by slug, each with its portal courses in
// their view: a course granted, whatever it holds of them, or one that
// links a portal course their own accounts see or they picked; then, by
// slug too, the portal courses their own accounts see or they picked that
// no course links, each a course of its own (portalCourseSlug, its id the
// portal course's). With `slug`, the one of that slug alone, if they read
// it.
export class ListCoursesQuery extends Query<CourseDto[]> {
  constructor(
    public readonly viewers: Viewers,
    public readonly slug?: CourseSlug,
  ) {
    super();
  }
}

// The site of a portal whose portal courses an admin links: the one its
// connector's settings read (CANVAS_URL), none for a portal of one site.
// Plugins answer it.
export class ConfiguredInstanceQuery extends Query<Instance> {
  constructor(public readonly portal: PortalId) {
    super();
  }
}

// an admin's course by the id catalog gave it
export class FindCourseQuery extends Query<CourseRef | null> {
  constructor(public readonly by: { id: string }) {
    super();
  }
}

// What these portal courses (a course's, as ListCoursesQuery gives them)
// published, newest first, the ones the viewers see (see
// GetCourseItemQuery)
export class ListCourseItemsQuery extends Query<ViewedItemDto[]> {
  constructor(
    public readonly viewers: Viewers,
    public readonly portalCourseIds: readonly string[],
    public readonly offset: number,
    public readonly limit: number,
  ) {
    super();
  }
}

// their files by folder and name, the ones the viewers see (see
// GetCourseFileQuery)
export class ListCourseFilesQuery extends Query<FileDto[]> {
  constructor(
    public readonly viewers: Viewers,
    public readonly portalCourseIds: readonly string[],
    public readonly offset: number,
    public readonly limit: number,
  ) {
    super();
  }
}

// A file and its course (as ListCoursesQuery names it), if the viewers see
// it: in a portal course, and attached to no post or one they see too.
// Null otherwise. Its content is null until their view opens it.
export class GetCourseFileQuery extends Query<CourseFileDto | null> {
  constructor(
    public readonly viewers: Viewers,
    public readonly fileId: string,
  ) {
    super();
  }
}

// the files the viewers see (see GetCourseFileQuery) whose content their
// view opens, of these portal courses or of all, by folder and name: what
// search may look through
export class ListVisibleContentQuery extends Query<VisibleContentDto[]> {
  constructor(
    public readonly viewers: Viewers,
    public readonly portalCourseIds: readonly string[] | null,
  ) {
    super();
  }
}

// A post and its course, if the viewers see it, in a portal course. Null
// otherwise.
export class GetCourseItemQuery extends Query<CourseItemDto | null> {
  constructor(
    public readonly viewers: Viewers,
    public readonly itemId: string,
  ) {
    super();
  }
}

// the posts the viewers see (see GetCourseItemQuery) and their view opens,
// of these portal courses or of all: what search may look through
export class ListVisibleItemsQuery extends Query<VisibleItemDto[]> {
  constructor(
    public readonly viewers: Viewers,
    public readonly portalCourseIds: readonly string[] | null,
  ) {
    super();
  }
}

// The courses of a portal as its shared account sees them now: a public
// portal's catalog, which users pick from. With `externalId`, that one
// alone, if it's there.
export class ListPortalCatalogQuery extends Query<CatalogCourseDto[]> {
  constructor(
    public readonly portal: PortalId,
    public readonly externalId?: string,
  ) {
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

// For ingest's passes.

// whether the hub has a file's bytes as the portal had them at `stamp`, in
// a version any account sees of it
export class HasBytesQuery extends Query<boolean> {
  constructor(
    public readonly file: PortalRef,
    public readonly stamp: Stamp,
  ) {
    super();
  }
}
