import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { PluginName } from '@app/kernel';
import {
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  type Slug,
} from '../../catalog/contracts.js';
import {
  GetTextPageQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { NotReadableError } from './errors.js';
import type { Page } from './page.js';
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

  // one page of the file's text; the first processor's unless one is named
  async text(
    userId: string,
    fileId: string,
    page: number,
    processor?: PluginName,
  ) {
    const { hash } = await this.readableContent(userId, fileId);
    const text = await this.queries.execute(
      new GetTextPageQuery(hash, page, processor),
    );
    if (!text) throw new NotReadableError('page');
    return text;
  }

  async content(userId: string, fileId: string) {
    const { file, hash } = await this.readableContent(userId, fileId);
    return { ...fileView(file), stream: await this.blobs.get(hash) };
  }

  // a file without content yet has nothing to read
  private async readableContent(userId: string, fileId: string) {
    const file = await readableFile(this.queries, userId, fileId);
    if (!file.contentHash) throw new NotReadableError('file');
    return { file, hash: file.contentHash };
  }
}
