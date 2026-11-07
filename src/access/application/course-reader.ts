import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  type CourseSlug,
} from '../../catalog/contracts.js';
import {
  FindMemberQuery,
  GetPostTextQuery,
  GetTextPageQuery,
  ListMembersQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { NotReadableError } from './errors.js';
import type { FilesAt, Page, TextAt } from './page.js';
import {
  readableCourse,
  readableCourses,
  readableFile,
  readableItem,
} from './readable.js';
import { courseView, fileView, itemView } from './views.js';

// What a user reads, for every way in (REST, MCP): each course or file
// checked as readable.ts says, then read from its owner.
@Injectable()
export class CourseReader {
  constructor(
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
  ) {}

  async courses(userId: string) {
    const { courses } = await readableCourses(this.queries, userId);
    return courses.map(courseView);
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

  // one page of the file's text, or a member's; the first processor's
  // unless one is named
  async text(
    userId: string,
    fileId: string,
    { page, processor, member }: TextAt,
  ) {
    const { hash } = await this.readableContent(userId, fileId, member);
    const text = await this.queries.execute(
      new GetTextPageQuery(hash, page, processor),
    );
    if (!text) throw new NotReadableError('page');
    return text;
  }

  // the file's bytes, or a member's, with its name and media type
  async content(userId: string, fileId: string, member?: string) {
    const { hash, name, mime } = await this.readableContent(
      userId,
      fileId,
      member,
    );
    return { name, mime, stream: await this.blobs.get(hash) };
  }

  // What content() would open, without opening it: the name, the folder
  // (the archive's, for a member), the size if known, and catalog's id of
  // the course. For a member, `archive` is its archive file's name. Both
  // check through readableContent, so they can't drift apart.
  async entry(userId: string, fileId: string, member?: string) {
    const { name, path, size, course, archive } = await this.readableContent(
      userId,
      fileId,
      member,
    );
    return { name, path, size, course, archive };
  }

  // the names of the courses the user reads, by catalog's id
  async courseNames(userId: string) {
    const { courses } = await readableCourses(this.queries, userId);
    return new Map(courses.map(({ id, name }) => [id, name]));
  }

  // A file without content yet, or whose content the user's view doesn't
  // open yet, has nothing to read; a member is read only inside a file the
  // user may read, and only if it was kept.
  private async readableContent(
    userId: string,
    fileId: string,
    member?: string,
  ) {
    const file = await readableFile(this.queries, userId, fileId);
    if (!file.contentHash) throw new NotReadableError('file');
    const at = { path: file.path, course: file.courseId };
    if (member === undefined)
      return {
        ...at,
        hash: file.contentHash,
        name: file.name,
        mime: file.mime,
        size: file.size,
        archive: undefined,
      };
    const found = await this.queries.execute(
      new FindMemberQuery(file.contentHash, member),
    );
    if (!found) throw new NotReadableError('member');
    return { ...at, ...found, name: basename(member), archive: file.name };
  }
}
