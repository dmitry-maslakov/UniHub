import type { PortalId } from '@app/kernel';
import type { CourseDto, CourseRef, Viewers } from '../../catalog/contracts.js';
import type { Showing } from './viewers.js';

// How a user reads a portal course: through an account of their own, as
// everyone reads a public portal's, or through the shared account in a
// course an admin linked it to
export type Via = 'account' | 'public' | 'link';

export type GroupedPortalCourse = CourseDto['portalCourses'][number] & {
  via: Via;
};

export interface GroupedCourse extends CourseRef {
  // the portals its portal courses come from, each once, by id
  sources: PortalId[];
  portalCourses: GroupedPortalCourse[];
  // a course of the user's: one granted them, or with a portal course of
  // their own account's, an admin's link or a public portal's they picked.
  // Any other they read all the same, by its slug and by search: a public
  // portal's course they didn't pick
  listed: boolean;
  // none of its portal courses is shown: the user hid them (README, Hidden
  // courses), or it isn't theirs. Read as any other; an empty course is
  // never hidden
  hidden: boolean;
}

// by the portal's mode, as the viewers read it (viewersOf): a public one,
// one read with users' own accounts through the user's own, any other
// through the shared account
export const viaOf = ({ open, shared }: Viewers, portal: PortalId): Via =>
  open.includes(portal)
    ? 'public'
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

type Tagged = Omit<GroupedCourse, 'listed' | 'hidden'>;

// a course catalog made of one portal course no course links (its id the
// portal course's: ListCoursesQuery)
const ofItsOwn = ({ id, portalCourses: [only, ...more] }: Tagged) =>
  only?.id === id && !more.length ? only : undefined;

// such a course, of a public portal
const publicOfItsOwn = (course: Tagged) => {
  const only = ofItsOwn(course);
  return only?.via === 'public' ? only : undefined;
};

// a public portal's course is the user's once picked, any other as it is
export const isTheirs = (
  { id, via }: Pick<GroupedPortalCourse, 'id' | 'via'>,
  { picked }: Pick<Showing, 'picked'>,
) => via !== 'public' || picked.has(id);

// The courses a user reads as they see them (README, Matching), the same
// for every way in. A public portal's course an admin linked to a course
// stays in it; one of its own the user shows with a course of theirs
// (`into`: each pick by the portal course of their own account it goes
// with) moves into the course that holds that portal course, after its
// own, while they read it through their account; any other stays a course
// of its own. Grouping moves cards alone, and says which are the user's
// (`listed`) and which they don't show (`hidden`): whatever is read, it's
// read as before.
export function regroup(
  courses: readonly CourseDto[],
  viewers: Viewers,
  into: ReadonlyMap<string, string>,
  showing: Showing,
): GroupedCourse[] {
  const tagged: Tagged[] = courses.map(({ portalCourses, ...course }) => ({
    ...course,
    sources: [],
    portalCourses: portalCourses.map((pc) => ({
      ...pc,
      via: viaOf(viewers, pc.portal),
    })),
  }));
  const home = ownIn(tagged);
  const hostOf = (course: Tagged) => {
    const pick = publicOfItsOwn(course);
    const own = pick && into.get(pick.id);
    return own === undefined ? undefined : home.get(own);
  };
  const guests = Map.groupBy(
    tagged.filter((course) => hostOf(course) !== undefined),
    (course) => hostOf(course)!,
  );
  const { courses: grantedIds } = viewers.shared;
  // a course an admin made, granted: theirs whatever it holds
  const granted = (course: Tagged) =>
    !ofItsOwn(course) && (!grantedIds || grantedIds.includes(course.id));
  return tagged
    .filter((course) => hostOf(course) === undefined)
    .map((course) => {
      const portalCourses = [
        ...course.portalCourses,
        ...(guests.get(course.slug) ?? []).flatMap((g) => g.portalCourses),
      ];
      const sources = [...new Set(portalCourses.map(({ portal }) => portal))];
      // what a course granted holds is the user's, picked or not
      const theirs = granted(course)
        ? portalCourses
        : portalCourses.filter((pc) => isTheirs(pc, showing));
      return {
        ...course,
        sources: sources.sort(),
        portalCourses,
        listed: granted(course) || theirs.length > 0,
        hidden:
          portalCourses.length > 0 &&
          theirs.every(({ id }) => showing.hidden.has(id)),
      };
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
