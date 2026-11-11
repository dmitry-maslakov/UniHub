import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import pLimit from 'p-limit';
import {
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  type CourseSlug,
  type Viewers,
} from '../../catalog/contracts.js';
import {
  FindMemberQuery,
  GetPageTextsQuery,
  GetPostTextQuery,
  GetTextPageQuery,
  ListMembersQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { readUpTo } from '@app/plugin-sdk';
import { UserPortalsQuery } from '../../accounts/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { NotReadableError, NotViewableError, ViewBusyError } from './errors.js';
import { noCoursesNote } from './no-courses.js';
import type { FilesAt, Page, TextAt, ViewAt } from './page.js';
import { PageRenderer } from './renderer.js';
import { VIEW_LIMITS, viewKind } from './viewable.js';
import {
  fileOf,
  listedCourses,
  readableCourse,
  readableCourses,
  readableFile,
  readableItem,
} from './readable.js';
import { viewersOfUser } from './viewers.js';
import { courseView, fileView, itemView } from './views.js';

export const VIEW_SLOTS = 2;
export const MAX_WAITING = 8;

// What a user reads, for every way in (REST, MCP): each course or file
// checked as readable.ts says, then read from its owner.
@Injectable()
export class CourseReader {
  // pictures drawn at once: each can hold a PDF's bytes three times over and
  // up to 2 GiB of WebAssembly memory, so a few, and a short queue behind
  private readonly slots = pLimit(VIEW_SLOTS);

  constructor(
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
    private readonly renderer: PageRenderer,
  ) {}

  // the user's courses, those they hide too
  async courses(userId: string) {
    const { courses } = await listedCourses(this.queries, userId);
    return courses.map(courseView);
  }

  // one course the user reads, theirs or not: a public portal's they
  // didn't pick too
  async course(userId: string, slug: CourseSlug) {
    const { course } = await readableCourse(this.queries, userId, slug);
    return courseView(course);
  }

  // why the user reads no course, for an agent to tell them, by how their
  // own sources stand; `sourcesUrl` is where they connect one
  async noCourses(userId: string, sourcesUrl: string) {
    const sources = await this.queries.execute(new UserPortalsQuery(userId));
    return noCoursesNote(sources, sourcesUrl);
  }

  async items(userId: string, slug: CourseSlug, { offset, limit }: Page) {
    const { viewers, portalCourseIds } = await readableCourse(
      this.queries,
      userId,
      slug,
    );
    const items = await this.queries.execute(
      new ListCourseItemsQuery(viewers, portalCourseIds, offset, limit),
    );
    return items.map(itemView);
  }

  // one post, as a search finds it
  async item(userId: string, itemId: string) {
    return itemView(await readableItem(this.queries, userId, itemId));
  }

  // a post's text, once its view opens it
  async itemText(userId: string, itemId: string) {
    const item = await readableItem(this.queries, userId, itemId);
    if (item.raw === null) throw new NotReadableError('item');
    return { text: await this.queries.execute(new GetPostTextQuery(item.raw)) };
  }

  // a page of a course's files, or those of the post named
  async files(
    userId: string,
    slug: CourseSlug,
    { offset, limit, item }: Page & Pick<FilesAt, 'item'>,
  ) {
    const { viewers, portalCourseIds } = await readableCourse(
      this.queries,
      userId,
      slug,
    );
    const files = await this.queries.execute(
      new ListCourseFilesQuery(viewers, portalCourseIds, offset, limit, item),
    );
    return files.map(fileView);
  }

  async file(userId: string, fileId: string) {
    const file = await readableFile(this.queries, userId, fileId);
    const texts = file.contentHash
      ? await this.queries.execute(new ListTextsQuery(file.contentHash))
      : [];
    return { ...fileView(file), texts };
  }

  // a page of the members of an archive (or another container) the file
  // holds, none if it holds none, or no content yet
  async members(userId: string, fileId: string, { offset, limit }: Page) {
    const file = await readableFile(this.queries, userId, fileId);
    return file.contentHash
      ? this.queries.execute(
          new ListMembersQuery(file.contentHash, offset, limit),
        )
      : [];
  }

  // one page of the file's text, or a member's; the page's longest text
  // unless a processor is named
  async text(
    userId: string,
    fileId: string,
    { page, processor, member }: TextAt,
  ) {
    const { hash } = await this.readableContent(
      await viewersOfUser(this.queries, userId),
      fileId,
      member,
    );
    const text = await this.queries.execute(
      new GetTextPageQuery(hash, page, processor),
    );
    if (!text) throw new NotReadableError('page');
    return text;
  }

  // One page of every text there is of the file, or a member's, the longest
  // first, with how many pages the longest-paged of them has.
  async texts(
    userId: string,
    fileId: string,
    { page, member }: Omit<TextAt, 'processor'>,
  ) {
    const { hash } = await this.readableContent(
      await viewersOfUser(this.queries, userId),
      fileId,
      member,
    );
    const found = await this.queries.execute(new GetPageTextsQuery(hash, page));
    if (found.length === 0) throw new NotReadableError('page');
    return {
      page,
      pages: Math.max(...found.map(({ pages }) => pages)),
      texts: found.map(({ processor, version, text }) => ({
        processor,
        version,
        text,
      })),
    };
  }

  // the file's bytes, or a member's, with its name and media type
  async content(userId: string, fileId: string, member?: string) {
    return this.contentOf(
      await viewersOfUser(this.queries, userId),
      fileId,
      member,
    );
  }

  // the file as a picture, read as content() is: a JPEG of an image, or of a
  // page of a PDF (`pages` and `page` null for an image). Anything else, or
  // too large, is not viewable; a page past the last is not found.
  async view(userId: string, fileId: string, { page, member }: ViewAt) {
    const { hash, name, mime } = await this.readableContent(
      await viewersOfUser(this.queries, userId),
      fileId,
      member,
    );
    const kind = viewKind(mime, name);
    if (!kind) throw new NotViewableError('neither a picture nor a PDF');
    // a slot is taken before the blob is read, so those waiting hold nothing
    if (this.slots.pendingCount >= MAX_WAITING) throw new ViewBusyError();
    return this.slots(async () => {
      const source = await readUpTo(
        await this.blobs.get(hash),
        VIEW_LIMITS[kind],
      );
      if (!source) throw new NotViewableError('too large');
      if (kind === 'image')
        return {
          name,
          data: await this.renderer.image(source),
          mime: 'image/jpeg' as const,
          pages: null,
          page: null,
        };
      const shown = await this.renderer.pdf(source, page);
      return {
        name,
        data: shown.data,
        mime: 'image/jpeg' as const,
        pages: shown.pages,
        page,
      };
    });
  }

  // What content() would open, without opening it: the name, the folder
  // (the archive's, for a member), the size of the bytes kept, and catalog's
  // id of the course. For a member, `archive` is its archive file's name.
  // Both check through readableContent, so they can't drift apart.
  async entry(userId: string, fileId: string, member?: string) {
    return this.entryOf(
      await viewersOfUser(this.queries, userId),
      fileId,
      member,
    );
  }

  // entry() and content() for many files, the user's viewers asked once
  async readingFiles(userId: string) {
    const viewers = await viewersOfUser(this.queries, userId);
    return {
      entry: (fileId: string, member?: string) =>
        this.entryOf(viewers, fileId, member),
      content: (fileId: string, member?: string) =>
        this.contentOf(viewers, fileId, member),
    };
  }

  // Each course the user reads as they see it, theirs or not (a pick shown
  // with a course of theirs is in it), by catalog's id of the course and
  // of each portal course in it, which a file's `course` may be.
  async courseNames(userId: string) {
    const { courses } = await readableCourses(this.queries, userId);
    return new Map(
      courses.flatMap(({ id, name, portalCourses }) =>
        [...portalCourses.map((pc) => pc.id), id].map(
          (key) => [key, { id, name }] as const,
        ),
      ),
    );
  }

  private async contentOf(viewers: Viewers, fileId: string, member?: string) {
    const { hash, name, mime } = await this.readableContent(
      viewers,
      fileId,
      member,
    );
    return { name, mime, stream: await this.blobs.get(hash) };
  }

  private async entryOf(viewers: Viewers, fileId: string, member?: string) {
    const { hash, name, path, size, course, archive } =
      await this.readableContent(viewers, fileId, member);
    return {
      name,
      path,
      // what is stored: a portal's size may be rounded, stale or none
      size: size ?? (await this.blobs.size(hash)),
      course,
      archive,
    };
  }

  // A file without content yet, or whose content the user's view doesn't
  // open yet, has nothing to read; a member is read only inside a file the
  // user may read, and only if it was kept.
  private async readableContent(
    viewers: Viewers,
    fileId: string,
    member?: string,
  ) {
    const file = await fileOf(this.queries, viewers, fileId);
    if (!file.contentHash) throw new NotReadableError('file');
    const at = { path: file.path, course: file.courseId };
    if (member === undefined)
      return {
        ...at,
        hash: file.contentHash,
        name: file.name,
        mime: file.mime,
        size: null,
        archive: undefined,
      };
    const found = await this.queries.execute(
      new FindMemberQuery(file.contentHash, member),
    );
    if (!found) throw new NotReadableError('member');
    return { ...at, ...found, name: basename(member), archive: file.name };
  }
}
