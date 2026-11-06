import { Command } from '@nestjs/cqrs';
import type { ContentHash, Json, MediaType, PortalId } from '@app/kernel';
import type { PortalRef } from '../domain/portal-ref.js';
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
