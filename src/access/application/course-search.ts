import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListVisibleContentQuery,
  ListVisibleItemsQuery,
} from '../../catalog/contracts.js';
import {
  ListContainedQuery,
  SearchTextsQuery,
} from '../../processing/contracts.js';
import { readableCourse, readableCourses } from './readable.js';
import type { SearchRequest } from './search-request.js';
import { placesOf, searchResults, type SearchView } from './views.js';

// Search over what a user may read, for REST and MCP. The index knows
// nothing of who reads what: the user's viewers (viewers.ts) pick the
// courses, catalog the files and posts their views show and open, and only
// those are looked through: the files' contents, the members with a text
// of those that are archives, the files' names, those archives' members'
// paths and the posts' texts, each by the version the user's view has. So
// a grant taken back, an account unlinked, or a file or a post removed,
// counts from the next search on.
@Injectable()
export class CourseSearch {
  constructor(private readonly queries: QueryBus) {}

  async search(
    userId: string,
    { q, course, limit }: SearchRequest,
  ): Promise<SearchView> {
    const { viewers, courses } = course
      ? await readableCourse(this.queries, userId, course).then(
          ({ viewers, course }) => ({ viewers, courses: [course] }),
        )
      : await readableCourses(this.queries, userId);
    if (!courses.length) return { results: [] };
    const portalCourseIds = course
      ? courses[0].portalCourses.map(({ id }) => id)
      : null;
    const [files, posts] = await Promise.all([
      this.queries.execute(
        new ListVisibleContentQuery(viewers, portalCourseIds),
      ),
      this.queries.execute(new ListVisibleItemsQuery(viewers, portalCourseIds)),
    ]);
    if (!files.length && !posts.length) return { results: [] };
    const archives = [...new Set(files.map(({ hash }) => hash))];
    const contained = archives.length
      ? await this.queries.execute(new ListContainedQuery(archives))
      : [];
    const places = placesOf(files, contained);
    const hits = await this.queries.execute(
      new SearchTextsQuery(
        q,
        {
          contents: [...places.keys()],
          posts: posts.map(({ itemId }) => itemId),
          files: files.map(({ fileId }) => fileId),
          archives,
        },
        limit,
      ),
    );
    return {
      results: searchResults(hits, { places, files, posts, courses }).slice(
        0,
        limit,
      ),
    };
  }
}
