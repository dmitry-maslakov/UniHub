import type { PortalId } from '@app/kernel';
import type { CourseDto, CourseRef, Viewers } from '../../catalog/contracts.js';

// How a user reads a portal course: through an account of their own, by a
// pick of a public portal's course, or through the shared account in a
// course an admin linked it to
export type Via = 'account' | 'pick' | 'link';

export type GroupedPortalCourse = CourseDto['portalCourses'][number] & {
  via: Via;
};

export interface GroupedCourse extends CourseRef {
  // the portals its portal courses come from, each once, by id
  sources: PortalId[];
  portalCourses: GroupedPortalCourse[];
}

// by the portal's mode, as the viewers read it (viewersOf): a public one's
// picked, one read with users' own accounts through the user's own, any
// other through the shared account
export const viaOf = ({ picks, shared }: Viewers, portal: PortalId): Via =>
  picks.portals.includes(portal)
    ? 'pick'
    : shared.except.includes(portal)
      ? 'account'
      : 'link';

// The course each portal course of the user's own accounts is in, by its
// slug: the courses a pick may go with
export const ownIn = (
  courses: readonly Pick<GroupedCourse, 'slug' | 'portalCourses'>[],
) =>
  new Map(
    courses.flatMap(({ slug, portalCourses }) =>
      portalCourses
        .filter(({ via }) => via === 'account')
        .map(({ id }) => [id, slug] as const),
    ),
  );

// a course catalog made of one portal course no course links (its id the
// portal course's: ListCoursesQuery), picked
const pickOfItsOwn = ({ id, portalCourses: [only, ...more] }: GroupedCourse) =>
  only?.id === id && !more.length && only.via === 'pick' ? only : undefined;

// The user's courses as they see them (README, Matching), the same for
// every way in. A pick an admin linked to a course stays in it; one of its
// own the user shows with a course of theirs (`into`: each pick by the
// portal course of their own account it goes with) moves into the course
// that holds that portal course, after its own, while they read it through
// their account; any other stays a course of its own. Grouping moves cards
// alone: whatever is read, it's read as before.
export function regroup(
  courses: readonly CourseDto[],
  viewers: Viewers,
  into: ReadonlyMap<string, string>,
): GroupedCourse[] {
  const tagged = courses.map(({ portalCourses, ...course }) => ({
    ...course,
    sources: [],
    portalCourses: portalCourses.map((pc) => ({
      ...pc,
      via: viaOf(viewers, pc.portal),
    })),
  }));
  const home = ownIn(tagged);
  const hostOf = (course: GroupedCourse) => {
    const pick = pickOfItsOwn(course);
    const own = pick && into.get(pick.id);
    return own === undefined ? undefined : home.get(own);
  };
  const guests = Map.groupBy(
    tagged.filter((course) => hostOf(course) !== undefined),
    (course) => hostOf(course)!,
  );
  return tagged
    .filter((course) => hostOf(course) === undefined)
    .map((course) => {
      const portalCourses = [
        ...course.portalCourses,
        ...(guests.get(course.slug) ?? []).flatMap((g) => g.portalCourses),
      ];
      const sources = [...new Set(portalCourses.map(({ portal }) => portal))];
      return { ...course, sources: sources.sort(), portalCourses };
    });
}

// The course a record shows in, by the id catalog names its course by: a
// course's own, or the portal course's for one no course links (each of
// them: a pick moved into another course is found in that one)
export const slugsOf = (courses: readonly GroupedCourse[]) =>
  new Map(
    courses.flatMap(({ id, slug, portalCourses }) => [
      [id, slug],
      ...portalCourses.map(({ id }) => [id, slug] as const),
    ]),
  );
