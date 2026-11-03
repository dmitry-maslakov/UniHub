import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  CourseOfQuery,
  FindCourseQuery,
  GetFileQuery,
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  ListCoursesQuery,
  type FileDto,
} from '../../catalog/contracts.js';
import { ReadableCoursesQuery } from '../../identity/contracts.js';
import {
  GetTextPageQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { GetContentQuery } from '../../storage/contracts.js';

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
// the user's courses and returns null for anything they can't see, so a
// caller can't tell "not yours" from "doesn't exist". Admins read every
// course; a portal course nobody linked to a course isn't readable here.
@Injectable()
export class CourseReader {
  constructor(private readonly queries: QueryBus) {}

  private async canRead(userId: string, courseId: string) {
    const readable = await this.queries.execute(
      new ReadableCoursesQuery(userId),
    );
    return readable.all || readable.courseIds.includes(courseId);
  }

  private async readableCourse(userId: string, slug: string) {
    const course = await this.queries.execute(new FindCourseQuery(slug));
    return course && (await this.canRead(userId, course.id)) ? course : null;
  }

  // a file of a course the user may read, not removed
  private async readableFile(userId: string, fileId: string) {
    const file = await this.queries.execute(new GetFileQuery(fileId));
    if (!file || file.removed || !file.portalCourseId) return null;
    const courseId = await this.queries.execute(
      new CourseOfQuery(file.portalCourseId),
    );
    return courseId && (await this.canRead(userId, courseId)) ? file : null;
  }

  async courses(userId: string) {
    const readable = await this.queries.execute(
      new ReadableCoursesQuery(userId),
    );
    const courses = await this.queries.execute(new ListCoursesQuery());
    return courses
      .filter((c) => readable.all || readable.courseIds.includes(c.id))
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
    if (!course) return null;
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
    if (!course) return null;
    const { offset, limit } = bounded(page);
    const files = await this.queries.execute(
      new ListCourseFilesQuery(course.id, offset, limit),
    );
    return files.map(toFileView);
  }

  // the file and what processors made of it, without the text
  async file(userId: string, fileId: string) {
    const file = await this.readableFile(userId, fileId);
    if (!file) return null;
    const texts = file.contentHash
      ? await this.queries.execute(new ListTextsQuery(file.contentHash))
      : [];
    return { ...toFileView(file), texts };
  }

  // one page (slide, section) of the file's text; the first processor's
  // unless one is named
  async text(userId: string, fileId: string, page: number, processor?: string) {
    const file = await this.readableFile(userId, fileId);
    if (!file?.contentHash) return null;
    return this.queries.execute(
      new GetTextPageQuery(file.contentHash, page, processor),
    );
  }

  async content(userId: string, fileId: string) {
    const file = await this.readableFile(userId, fileId);
    if (!file?.contentHash) return null;
    return {
      ...toFileView(file),
      stream: await this.queries.execute(new GetContentQuery(file.contentHash)),
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
