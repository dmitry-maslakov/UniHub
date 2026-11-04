import { Injectable } from '@nestjs/common';
import { QueryBus, type Query } from '@nestjs/cqrs';
import type { PluginName } from '@app/kernel';
import {
  FindCourseQuery,
  GetCourseFileQuery,
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  ListCoursesQuery,
  type Slug,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import {
  GetTextPageQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { NotReadableError } from './errors.js';
import type { Page } from './page.js';
import { courseView, fileView, itemView } from './views.js';

// What a user may read, for every way in (REST, MCP). The rules are the
// owners': catalog finds only what a course shows, identity's ReadScope says
// which courses the user reads. Here they are asked together, and whatever the
// user can't read is a NotReadableError, so a caller can't tell "not yours"
// from "doesn't exist".
@Injectable()
export class CourseReader {
  constructor(
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
  ) {}

  async courses(userId: string) {
    const [courses, scope] = await Promise.all([
      this.queries.execute(new ListCoursesQuery()),
      this.queries.execute(new ReadScopeQuery(userId)),
    ]);
    return courses.filter(({ id }) => scope.allows(id)).map(courseView);
  }

  async items(userId: string, slug: Slug, { offset, limit }: Page) {
    const course = await this.readableCourse(userId, slug);
    const items = await this.queries.execute(
      new ListCourseItemsQuery(course.id, offset, limit),
    );
    return items.map(itemView);
  }

  async files(userId: string, slug: Slug, { offset, limit }: Page) {
    const course = await this.readableCourse(userId, slug);
    const files = await this.queries.execute(
      new ListCourseFilesQuery(course.id, offset, limit),
    );
    return files.map(fileView);
  }

  async file(userId: string, fileId: string) {
    const file = await this.readableFile(userId, fileId);
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

  private readableCourse(userId: string, slug: Slug) {
    return this.readable(userId, 'course', {
      query: new FindCourseQuery({ slug }),
      courseOf: ({ id }) => id,
    });
  }

  private readableFile(userId: string, fileId: string) {
    return this.readable(userId, 'file', {
      query: new GetCourseFileQuery(fileId),
      courseOf: ({ courseId }) => courseId,
    });
  }

  // a file without content yet has nothing to read
  private async readableContent(userId: string, fileId: string) {
    const file = await this.readableFile(userId, fileId);
    if (!file.contentHash) throw new NotReadableError('file');
    return { file, hash: file.contentHash };
  }

  // what the query finds, if the user may read the course it is in; the
  // thing and the user's scope are asked for at once
  private async readable<T>(
    userId: string,
    what: NotReadableError['what'],
    find: { query: Query<T | null>; courseOf: (found: T) => string },
  ) {
    const [found, scope] = await Promise.all([
      this.queries.execute(find.query),
      this.queries.execute(new ReadScopeQuery(userId)),
    ]);
    if (!found || !scope.allows(find.courseOf(found)))
      throw new NotReadableError(what);
    return found;
  }
}
