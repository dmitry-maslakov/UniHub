import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ListVisibleContentQuery, type Slug } from '../../catalog/contracts.js';
import { SearchTextsQuery } from '../../processing/contracts.js';
import { readableCourses } from './course-reader.js';
import { NotReadableError } from './errors.js';
import type { SearchRequest } from './search-request.js';
import { searchResultView, type SearchView } from './views.js';

// Search over what a user may read, for REST and MCP. The index knows
// nothing of who reads what: identity's scope picks the courses, catalog the
// files they show, and only those files' contents are looked through, so a
// grant taken back or a file removed counts from the next search on.
@Injectable()
export class CourseSearch {
  constructor(private readonly queries: QueryBus) {}

  async search(
    userId: string,
    { q, course, limit }: SearchRequest,
  ): Promise<SearchView> {
    const courses = await this.courses(userId, course);
    if (!courses.length) return { results: [] };
    const files = await this.queries.execute(
      new ListVisibleContentQuery(courses.map(({ id }) => id)),
    );
    // by folder and name within each content, as catalog lists them
    const byContent = Map.groupBy(files, ({ hash }) => hash);
    if (!byContent.size) return { results: [] };
    const hits = await this.queries.execute(
      new SearchTextsQuery(q, [...byContent.keys()], limit),
    );
    const slugs = new Map(courses.map(({ id, slug }) => [id, slug]));
    return {
      results: hits.map((hit) =>
        searchResultView(hit, byContent.get(hit.hash)!, slugs),
      ),
    };
  }

  // the courses the user reads, or the one named if they read it
  private async courses(userId: string, slug?: Slug) {
    const readable = await readableCourses(this.queries, userId);
    if (!slug) return readable;
    const named = readable.filter((course) => course.slug === slug);
    if (!named.length) throw new NotReadableError('course');
    return named;
  }
}
