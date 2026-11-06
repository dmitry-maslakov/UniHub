import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListVisibleContentQuery,
  type CourseRef,
} from '../../catalog/contracts.js';
import {
  ListContainedQuery,
  SearchTextsQuery,
} from '../../processing/contracts.js';
import { readableCourse, readableCourses } from './readable.js';
import type { SearchRequest } from './search-request.js';
import { placesOf, searchResultView, type SearchView } from './views.js';

// Search over what a user may read, for REST and MCP. The index knows
// nothing of who reads what: identity's scope picks the courses, catalog the
// files they show, and only those files' contents are looked through, and
// the members with a text of those that are archives, so a grant taken back
// or a file removed counts from the next search on.
@Injectable()
export class CourseSearch {
  constructor(private readonly queries: QueryBus) {}

  async search(
    userId: string,
    { q, course, limit }: SearchRequest,
  ): Promise<SearchView> {
    const courses: CourseRef[] = course
      ? [await readableCourse(this.queries, userId, course)]
      : await readableCourses(this.queries, userId);
    if (!courses.length) return { results: [] };
    const files = await this.queries.execute(
      new ListVisibleContentQuery(courses.map(({ id }) => id)),
    );
    const contained = await this.queries.execute(
      new ListContainedQuery([...new Set(files.map(({ hash }) => hash))]),
    );
    const places = placesOf(files, contained);
    const hits = await this.queries.execute(
      new SearchTextsQuery(q, [...places.keys()], limit),
    );
    const slugs = new Map(courses.map(({ id, slug }) => [id, slug]));
    return {
      results: hits.map((hit) =>
        searchResultView(hit, places.get(hit.hash)!, slugs),
      ),
    };
  }
}
