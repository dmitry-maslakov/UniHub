import { Command } from '@nestjs/cqrs';
import type { ContentHash, Json, MediaType, PortalId } from '@app/kernel';
import type { PortalRef } from '../domain/portal-ref.js';
import type { Shown } from '../domain/publication.js';
import type { Stamp } from '../domain/view/view.repository.js';
import type { AcademicYear, CourseName, Slug } from '../domain/values.js';

// What catalog does when asked: ingest writes what portals send (by the
// portal's ids, so `course` and `item` are theirs too), admins make courses.
// The values are checked where they come in, so the types say they were;
// text and json come as postgres keeps them (the kernel's StoredText and
// StoredJson), so what a portal sends again compares equal to what's stored.

export interface PortalCourseInput {
  portal: PortalId;
  externalId: string;
  name: string;
  url: string | null;
  meta: Json | null;
}

export interface ItemInput {
  portal: PortalId;
  externalId: string;
  course: string | null;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
}

export interface FileInput {
  portal: PortalId;
  externalId: string;
  course: string | null;
  item: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: MediaType | null;
  sourceUpdatedAt: Date | null;
}

// `changed` is false when the portal sent exactly what we already had
interface Synced {
  id: string;
  changed: boolean;
}

export class UpsertPortalCourseCommand extends Command<Synced> {
  constructor(public readonly data: PortalCourseInput) {
    super();
  }
}

export class UpsertItemCommand extends Command<Synced> {
  constructor(public readonly data: ItemInput) {
    super();
  }
}

export class UpsertFileCommand extends Command<
  Synced & {
    // no content yet, or the portal changed the file since it was stored
    needsContent: boolean;
  }
> {
  constructor(public readonly data: FileInput) {
    super();
  }
}

// false when the file already had this content
export class SetFileContentCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly file: PortalRef,
    public readonly hash: ContentHash,
  ) {
    super();
  }
}

// removing something unknown or already removed changes nothing
export class RemoveItemCommand extends Command<{ changed: boolean }> {
  constructor(public readonly item: PortalRef) {
    super();
  }
}

export class RemoveFileCommand extends Command<{ changed: boolean }> {
  constructor(public readonly file: PortalRef) {
    super();
  }
}

export class CreateCourseCommand extends Command<{ id: string }> {
  constructor(
    public readonly slug: Slug,
    public readonly name: CourseName,
  ) {
    super();
  }
}

// a portal course that is linked already moves to this course; one the hub
// has nothing of yet is linked all the same
export class LinkPortalCourseCommand extends Command<void> {
  constructor(
    public readonly course: Slug,
    public readonly portalCourse: PortalRef,
    public readonly year: AcademicYear | null,
  ) {
    super();
  }
}

// unlinking one the hub has nothing of changes nothing
export class UnlinkPortalCourseCommand extends Command<{ changed: boolean }> {
  constructor(public readonly portalCourse: PortalRef) {
    super();
  }
}

// A record as a user's account saw it: locked for it, or open
export interface Seen<T> {
  record: T;
  open: boolean;
}

// What a user's account sees of a portal's courses, from now on (none it
// saw before but these), shown at `at`
export class ViewCoursesCommand extends Command<void> {
  constructor(
    public readonly account: string,
    public readonly portal: PortalId,
    public readonly courses: readonly PortalCourseInput[],
    public readonly at: Shown,
  ) {
    super();
  }
}

// What a user's account sees of one course, from `at` on: these posts and
// files, and of what it saw before only the records `kept` names (by the
// portal's ids). Each record is the version the accounts that see it alike
// share. The course is one the account's courses named.
export class ViewCourseCommand extends Command<void> {
  constructor(
    public readonly account: string,
    public readonly portal: PortalId,
    public readonly course: string,
    public readonly items: readonly Seen<ItemInput>[],
    public readonly files: readonly Seen<FileInput>[],
    public readonly kept: {
      items: readonly string[];
      files: readonly string[];
    },
    public readonly at: Shown,
  ) {
    super();
  }
}

// The bytes of a file as the portal had them at `stamp`, for the versions
// users' accounts see of it; false when they all had them
export class StoreBytesCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly file: PortalRef,
    public readonly stamp: Stamp,
    public readonly hash: ContentHash,
  ) {
    super();
  }
}

// An account gone, unlinked or replaced: what it saw goes with it
export class ForgetAccountCommand extends Command<void> {
  constructor(public readonly account: string) {
    super();
  }
}
