import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { PluginName } from '@app/kernel';
import {
  FindCourseQuery,
  GetCourseFileQuery,
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  ListCoursesQuery,
  type FileDto,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import {
  GetTextPageQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { NotReadableError } from './errors.js';

export interface Page {
  offset: number;
  limit: number;
}

export const MAX_LIMIT = 200;
// far past any real list, small enough for the database to take
export const MAX_OFFSET = 1_000_000_000;

// whoever calls, a page stays within bounds
const bounded = ({ offset, limit }: Page): Page => ({
  offset: Math.min(MAX_OFFSET, Math.max(0, Math.trunc(offset) || 0)),
  limit: Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit) || 1)),
});

// What a user may read, for every way in (REST, MCP): every method checks
// the user's courses and throws NotReadableError for anything they can't
// see, so a caller can't tell "not yours" from "doesn't exist". Admins read
// every course; a portal course nobody linked to a course isn't readable
// here.
@Injectable()
export class CourseReader {
  constructor(
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
  ) {}

  private async canRead(userId: string, courseId: string) {
    const scope = await this.queries.execute(new ReadScopeQuery(userId));
    return scope.allows(courseId);
  }

  private async readableCourse(userId: string, slug: string) {
    const course = await this.queries.execute(new FindCourseQuery(slug));
    if (course && (await this.canRead(userId, course.id))) return course;
    throw new NotReadableError('course');
  }

  // a file its course shows (catalog decides which), of a course the user
  // may read
  private async readableFile(userId: string, fileId: string) {
    const file = await this.queries.execute(new GetCourseFileQuery(fileId));
    if (file && (await this.canRead(userId, file.courseId))) return file;
    throw new NotReadableError('file');
  }

  // what the file's content is stored under; a file without content yet
  // has nothing to read
  private async readableContent(userId: string, fileId: string) {
    const file = await this.readableFile(userId, fileId);
    if (!file.contentHash) throw new NotReadableError('file');
    return { file, hash: file.contentHash };
  }

  async courses(userId: string) {
    const scope = await this.queries.execute(new ReadScopeQuery(userId));
    const courses = await this.queries.execute(new ListCoursesQuery());
    return courses
      .filter((c) => scope.allows(c.id))
      .map(({ slug, name, portalCourses }) => ({
        slug,
        name,
        portalCourses: portalCourses.map(({ portal, name, year }) => ({
          portal,
          name,
          year,
        })),
      }));
  }

  async items(userId: string, slug: string, page: Page) {
    const course = await this.readableCourse(userId, slug);
    const { offset, limit } = bounded(page);
    const items = await this.queries.execute(
      new ListCourseItemsQuery(course.id, offset, limit),
    );
    return items.map(({ id, portal, kind, title, url, publishedAt, raw }) => ({
      id,
      portal,
      kind,
      title,
      url,
      publishedAt,
      raw,
    }));
  }

  async files(userId: string, slug: string, page: Page) {
    const course = await this.readableCourse(userId, slug);
    const { offset, limit } = bounded(page);
    const files = await this.queries.execute(
      new ListCourseFilesQuery(course.id, offset, limit),
    );
    return files.map(toFileView);
  }

  // the file and what processors made of it, without the text
  async file(userId: string, fileId: string) {
    const file = await this.readableFile(userId, fileId);
    const texts = file.contentHash
      ? await this.queries.execute(new ListTextsQuery(file.contentHash))
      : [];
    return { ...toFileView(file), texts };
  }

  // one page (slide, section) of the file's text; the first processor's
  // unless one is named
  async text(userId: string, fileId: string, page: number, processor?: string) {
    const { hash } = await this.readableContent(userId, fileId);
    // a name no plugin can have names no text
    const name = PluginName.optional().safeParse(processor);
    if (!name.success) throw new NotReadableError('page');
    const text = await this.queries.execute(
      new GetTextPageQuery(hash, page, name.data),
    );
    if (!text) throw new NotReadableError('page');
    return text;
  }

  async content(userId: string, fileId: string) {
    const { file, hash } = await this.readableContent(userId, fileId);
    return {
      ...toFileView(file),
      stream: await this.blobs.get(hash),
    };
  }
}

const toFileView = (f: FileDto) => ({
  id: f.id,
  portal: f.portal,
  // the post it came with, if any
  itemId: f.itemId,
  name: f.name,
  path: f.path,
  url: f.url,
  size: f.size,
  mime: f.mime,
  hasContent: f.contentHash !== null,
});
