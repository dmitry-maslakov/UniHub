import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListCoursesQuery,
  ListVisibleContentQuery,
  ListVisibleItemsQuery,
  type CourseSlug,
  type Viewers,
} from '../../catalog/contracts.js';
import {
  ListContainedQuery,
  SearchTextsQuery,
} from '../../processing/contracts.js';
import { regroup } from './grouping.js';
import { readableCourse } from './readable.js';
import type { SearchRequest } from './search-request.js';
import { readingOf, readNothing } from './viewers.js';
import { placesOf, searchResults, type SearchView } from './views.js';

// Search over what a user may read, for REST and MCP. The index knows
// nothing of who reads what: the user's viewers (viewers.ts) pick the
// courses, catalog the files and posts their views show and open, and only
// those are looked through: the files' contents, the members with a text
// of those that are archives, the files' names, those archives' members'
// paths and the posts' texts, each by the version the user's view has. So
// a grant taken back, an account unlinked, or a file or a post removed,
// counts from the next search on. Every course the user reads is looked
// through, theirs or not, hidden or not; `shown` cuts a search of all
// courses to those they show among theirs (the web app's).
@Injectable()
export class CourseSearch {
  constructor(private readonly queries: QueryBus) {}

  async search(
    userId: string,
    {
      q,
      course,
      type,
      limit,
      shown = false,
    }: SearchRequest & {
      shown?: boolean;
    },
  ): Promise<SearchView> {
    const read = course
      ? await this.inCourse(userId, course)
      : await this.everywhere(userId, shown);
    // only these kinds: the other's ids aren't given to the index
    const { courses } = read;
    const files = type === 'posts' ? [] : read.files;
    const posts = type === 'files' ? [] : read.posts;
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

  private async inCourse(userId: string, slug: CourseSlug) {
    const { viewers, course, portalCourseIds } = await readableCourse(
      this.queries,
      userId,
      slug,
    );
    const [files, posts] = await this.visible(viewers, portalCourseIds);
    return { courses: [course], files, posts };
  }

  // the courses, to name a result's as the user sees them, asked for
  // alongside
  private async everywhere(userId: string, shown: boolean) {
    const { viewers, into, showing } = await readingOf(this.queries, userId);
    if (readNothing(viewers)) return { courses: [], files: [], posts: [] };
    const listing = this.queries.execute(new ListCoursesQuery(viewers));
    if (!shown) {
      const [courses, [files, posts]] = await Promise.all([
        listing,
        this.visible(viewers, null),
      ]);
      return {
        courses: regroup(courses, viewers, into, showing),
        files,
        posts,
      };
    }
    const courses = regroup(await listing, viewers, into, showing).filter(
      ({ hidden }) => !hidden,
    );
    const [files, posts] = await this.visible(
      viewers,
      courses.flatMap(({ portalCourses }) => portalCourses.map(({ id }) => id)),
    );
    return { courses, files, posts };
  }

  // what the viewers' views open, of these portal courses or of all
  private visible(viewers: Viewers, portalCourseIds: string[] | null) {
    return Promise.all([
      this.queries.execute(
        new ListVisibleContentQuery(viewers, portalCourseIds),
      ),
      this.queries.execute(new ListVisibleItemsQuery(viewers, portalCourseIds)),
    ]);
  }
}
