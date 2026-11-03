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
import { ListRepresentationsQuery } from '../../processing/contracts.js';
import { GetContentQuery } from '../../storage/contracts.js';

export interface Page {
  offset: number;
  limit: number;
}

// What a user may read, for every way in (REST, MCP): every method checks
// the user's courses and returns null for anything they can't see, so a
// caller can't tell "not yours" from "doesn't exist".
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

  async items(userId: string, slug: string, { offset, limit }: Page) {
    const course = await this.readableCourse(userId, slug);
    if (!course) return null;
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

  async files(userId: string, slug: string, { offset, limit }: Page) {
    const course = await this.readableCourse(userId, slug);
    if (!course) return null;
    const files = await this.queries.execute(
      new ListCourseFilesQuery(course.id, offset, limit),
    );
    return files.map(toFileView);
  }

  // the file and what processors made of it, without the text itself
  async file(userId: string, fileId: string) {
    const file = await this.readableFile(userId, fileId);
    if (!file) return null;
    const texts = file.contentHash
      ? await this.queries.execute(
          new ListRepresentationsQuery(file.contentHash),
        )
      : [];
    return {
      ...toFileView(file),
      texts: texts.map(({ processor, version, parts }) => ({
        processor,
        version,
        pages: parts.length,
      })),
    };
  }

  // one page (slide, section) of the file's text; the first processor's
  // unless one is named
  async text(userId: string, fileId: string, page: number, processor?: string) {
    const file = await this.readableFile(userId, fileId);
    if (!file?.contentHash) return null;
    const texts = await this.queries.execute(
      new ListRepresentationsQuery(file.contentHash),
    );
    const text = processor
      ? texts.find((t) => t.processor === processor)
      : texts[0];
    if (!text || page < 1 || page > text.parts.length) return null;
    return {
      processor: text.processor,
      version: text.version,
      page,
      pages: text.parts.length,
      text: text.parts[page - 1],
    };
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
  name: f.name,
  path: f.path,
  url: f.url,
  size: f.size,
  mime: f.mime,
  hasContent: f.contentHash !== null,
});
