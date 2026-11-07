import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListVisibleContentQuery,
  type CourseSlug,
} from '../../catalog/contracts.js';
import { ownIn } from './grouping.js';
import type { PickMatch } from './queries.js';
import { readableCourses } from './readable.js';
import { suggestions } from './suggestions.js';

// Which course of the user's own a pick goes with (README, Matching), for
// accounts' picks: each time as the user sees their courses now, so one
// they no longer read through their own account takes none
@Injectable()
export class CourseMatching {
  constructor(private readonly queries: QueryBus) {}

  // OwnPortalCourseQuery
  async ownPortalCourse(userId: string, slug: CourseSlug) {
    const { courses } = await readableCourses(this.queries, userId);
    const course = courses.find((c) => c.slug === slug);
    const own = course?.portalCourses.find(({ via }) => via === 'account');
    return own?.id ?? null;
  }

  // PickMatchesQuery: the contents the user's view opens of their own
  // portal courses and of these picks, and nothing else, decide the
  // suggestions; none without a course of their own
  async matches(
    userId: string,
    picks: readonly string[],
  ): Promise<Map<string, PickMatch>> {
    const { viewers, into, courses } = await readableCourses(
      this.queries,
      userId,
    );
    const own = ownIn(courses);
    const contents = own.size
      ? await this.queries.execute(
          new ListVisibleContentQuery(viewers, [...own.keys(), ...picks]),
        )
      : [];
    const suggested = suggestions(contents, picks, own);
    return new Map(
      picks.map((id) => {
        const goesWith = into.get(id);
        return [
          id,
          {
            into: (goesWith !== undefined && own.get(goesWith)) || null,
            suggestedInto: suggested.get(id) ?? null,
          },
        ];
      }),
    );
  }
}
