import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { ContentHash } from '@app/kernel';
import {
  ListVisibleKeysQuery,
  type CourseSlug,
  type VisibleKeyDto,
} from '../../catalog/contracts.js';
import {
  ListWaitingQuery,
  type WaitingContent,
} from '../../processing/contracts.js';
import { readableCourse, readableCourses } from './readable.js';
import { courseView, type CourseView } from './views.js';

export interface Waiting {
  text: number;
  pictures: number;
}

export interface CourseProcessingView {
  // the distinct contents of the course's files, top-level files only
  total: number;
  waiting: Waiting;
}

// how far the processors are with these files' contents: a content is
// waiting for text, for pictures, or both (WaitingContent)
export function progressOf(
  files: readonly Pick<VisibleKeyDto, 'hash'>[],
  waiting: ReadonlyMap<ContentHash, WaitingContent>,
): CourseProcessingView {
  const hashes = new Set(files.map(({ hash }) => hash));
  const counts = { text: 0, pictures: 0 };
  for (const hash of hashes) {
    const found = waiting.get(hash);
    if (!found) continue;
    if (found.text) counts.text++;
    if (found.pictures) counts.pictures++;
  }
  return { total: hashes.size, waiting: counts };
}

// What the processors still have to read of a user's courses, over the
// files their view opens (the file list's own query). Members of archives
// aren't counted: only top-level files, as existing queries list them.
@Injectable()
export class CourseProcessing {
  private readonly logger = new Logger(CourseProcessing.name);

  constructor(private readonly queries: QueryBus) {}

  async of(userId: string, slug: CourseSlug) {
    const { viewers, portalCourseIds } = await readableCourse(
      this.queries,
      userId,
      slug,
    );
    const files = await this.queries.execute(
      new ListVisibleKeysQuery(viewers, portalCourseIds),
    );
    return progressOf(files, await this.waiting(files));
  }

  // The user's courses as courses() lists them, each with what waits when
  // anything does; the files of all of them are asked for, and what waits
  // for, once.
  async listing(
    userId: string,
  ): Promise<(CourseView & { processing?: Waiting })[]> {
    const { viewers, courses } = await readableCourses(this.queries, userId);
    const portalCourseIds = courses.flatMap(({ portalCourses }) =>
      portalCourses.map(({ id }) => id),
    );
    // the counts never fail the list
    let counted;
    try {
      const files = portalCourseIds.length
        ? await this.queries.execute(
            new ListVisibleKeysQuery(viewers, portalCourseIds),
          )
        : [];
      counted = { files, waiting: await this.waiting(files) };
    } catch (err) {
      this.logger.warn(
        `no counts for the course list: ${err instanceof Error ? err.message : String(err)}`,
      );
      return courses.map(courseView);
    }
    const { files, waiting } = counted;
    return courses.map((course) => {
      const ids = new Set(course.portalCourses.map(({ id }) => id));
      const { waiting: counts } = progressOf(
        files.filter(({ portalCourseId }) => ids.has(portalCourseId)),
        waiting,
      );
      return counts.text || counts.pictures
        ? { ...courseView(course), processing: counts }
        : courseView(course);
    });
  }

  private async waiting(files: readonly VisibleKeyDto[]) {
    if (!files.length) return new Map<ContentHash, WaitingContent>();
    const found = await this.queries.execute(
      new ListWaitingQuery(
        files.map(({ hash, name, mime }) => ({ hash, name, mime })),
      ),
    );
    return new Map(found.map((content) => [content.hash, content]));
  }
}
