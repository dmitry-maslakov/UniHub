import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListVisibleContentQuery,
  ListVisibleItemsQuery,
  type CourseRef,
} from '../../catalog/contracts.js';
import {
  ListContainedQuery,
  SearchTextsQuery,
} from '../../processing/contracts.js';
import { readableCourse, readableCourses } from './readable.js';
import type { SearchRequest } from './search-request.js';
import { placesOf, searchResults, type SearchView } from './views.js';

// Search over what a user may read, for REST and MCP. The index knows
// nothing of who reads what: identity's scope picks the courses, catalog the
// files and posts they show, and only those are looked through: the files'
// contents, the members with a text of those that are archives, the files'
// names, those archives' members' paths and the posts' texts. So a grant
// taken back, or a file or a post removed, counts from the next search on.
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
    const ids = courses.map(({ id }) => id);
    const [files, posts] = await Promise.all([
      this.queries.execute(new ListVisibleContentQuery(ids)),
      this.queries.execute(new ListVisibleItemsQuery(ids)),
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
