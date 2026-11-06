import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  type Slug,
} from '../../catalog/contracts.js';
import {
  FindMemberQuery,
  GetTextPageQuery,
  ListMembersQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { NotReadableError } from './errors.js';
import type { Page, TextAt } from './page.js';
import { readableCourse, readableCourses, readableFile } from './readable.js';
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
    return (await readableCourses(this.queries, userId)).map(courseView);
  }

  async items(userId: string, slug: Slug, { offset, limit }: Page) {
    const course = await readableCourse(this.queries, userId, slug);
    const items = await this.queries.execute(
      new ListCourseItemsQuery(course.id, offset, limit),
    );
    return items.map(itemView);
  }

  async files(userId: string, slug: Slug, { offset, limit }: Page) {
    const course = await readableCourse(this.queries, userId, slug);
    const files = await this.queries.execute(
      new ListCourseFilesQuery(course.id, offset, limit),
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

  // A file without content yet has nothing to read; a member is read only
  // inside a file the user may read, and only if it was kept.
  private async readableContent(
    userId: string,
    fileId: string,
    member?: string,
  ) {
    const file = await readableFile(this.queries, userId, fileId);
    if (!file.contentHash) throw new NotReadableError('file');
    if (member === undefined)
      return { hash: file.contentHash, name: file.name, mime: file.mime };
    const found = await this.queries.execute(
      new FindMemberQuery(file.contentHash, member),
    );
    if (!found) throw new NotReadableError('member');
    return { ...found, name: basename(member) };
  }
}
