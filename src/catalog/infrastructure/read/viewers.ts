import { SHARED_ACCOUNT } from '@app/kernel';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { Viewers } from '../../application/queries.js';

// What a user's viewers see (Viewers): the reader queries all read through
// these, so a record can't be listed or searched and then not be found, or
// the other way round.

// a sight that shows its version at `now`: shown already, not hidden yet
export const shows = (now: Date) => ({
  shownFrom: { lte: now },
  OR: [{ hiddenFrom: null }, { hiddenFrom: { gt: now } }],
});

// one whose view opens the version's content too: not locked for its
// account, and past the time it opens
export const opens = (now: Date) => ({
  ...shows(now),
  open: true,
  openFrom: { lte: now },
});

type Sight = ReturnType<typeof shows>;

// the shared account's, in a portal read as shared
const shared = (viewers: Viewers, sight: Sight) => ({
  sights: { some: { account: SHARED_ACCOUNT, ...sight } },
  record: { portal: { notIn: [...viewers.shared.except] } },
});

// and only in a course granted
const granted = ({ shared: { courses } }: Viewers) => ({
  link: courses ? { is: { courseId: { in: [...courses] } } } : { isNot: null },
});

// the user's own accounts', whole, in a portal course linked or not
const own = (viewers: Viewers, sight: Sight) => ({
  sights: { some: { account: { in: [...viewers.accounts] }, ...sight } },
  portalCourseId: { not: null },
});

// The posts the viewers see: through the shared account, in a portal read
// as shared and a portal course linked to a course granted; or through
// their own accounts
export const itemSeen = (
  viewers: Viewers,
  sight: Sight,
): Prisma.ItemVersionWhereInput => {
  const { record, ...sharedSight } = shared(viewers, sight);
  return {
    OR: [
      { ...sharedSight, item: record, portalCourse: granted(viewers) },
      own(viewers, sight),
    ],
  };
};

// The files the viewers see, as posts are, attached to no post or one they
// see too (attachments go with their post)
export const fileSeen = (
  viewers: Viewers,
  now: Date,
  sight: Sight = shows(now),
): Prisma.FileVersionWhereInput => {
  const { record, ...sharedSight } = shared(viewers, sight);
  return {
    AND: [
      {
        OR: [
          { ...sharedSight, file: record, portalCourse: granted(viewers) },
          own(viewers, sight),
        ],
      },
      {
        OR: [
          { itemId: null },
          { item: { versions: { some: itemSeen(viewers, shows(now)) } } },
        ],
      },
    ],
  };
};

// The sights of a file's version through which the viewers' view opens
// its content: the shared account's in a portal read as shared, else the
// user's own accounts'. None, and its content is the viewers' to see only
// once there is one.
export const opening = (
  viewers: Viewers,
  now: Date,
): Prisma.FileSightWhereInput => ({
  ...opens(now),
  AND: [
    {
      OR: [
        {
          account: SHARED_ACCOUNT,
          version: { file: { portal: { notIn: [...viewers.shared.except] } } },
        },
        { account: { in: [...viewers.accounts] } },
      ],
    },
  ],
});

// a portal course's sights through which the viewers see it, as posts are
// seen
export const courseSeen = (
  viewers: Viewers,
  now: Date,
): Prisma.CourseSightWhereInput => ({
  ...shows(now),
  AND: [
    {
      OR: [
        {
          account: SHARED_ACCOUNT,
          version: {
            portalCourse: { portal: { notIn: [...viewers.shared.except] } },
          },
        },
        { account: { in: [...viewers.accounts] } },
      ],
    },
  ],
});

// the course a record the viewers see shows in: the course its portal
// course is linked to, else the portal course itself (ListCoursesQuery)
export const withCourse = {
  portalCourse: { select: { id: true, link: { select: { courseId: true } } } },
} as const;

export const courseOf = (row: {
  portalCourse: { id: string; link: { courseId: string } | null } | null;
}) =>
  row.portalCourse && (row.portalCourse.link?.courseId ?? row.portalCourse.id);

// of these portal courses, or of every one
export const inCourses = (portalCourseIds: readonly string[] | null) =>
  portalCourseIds ? { portalCourseId: { in: [...portalCourseIds] } } : {};
