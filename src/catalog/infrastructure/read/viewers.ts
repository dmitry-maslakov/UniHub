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

// the shared account's too in a public portal, whatever the portal course
const inOpen = ({ open }: Viewers, sight: Sight) => ({
  sights: { some: { account: SHARED_ACCOUNT, ...sight } },
  record: { portal: { in: [...open] } },
});

// the user's own accounts', whole, in a portal course linked or not that
// their accounts are shown too
const own = (viewers: Viewers, sight: Sight, now: Date) => {
  const account = { in: [...viewers.accounts] };
  return {
    sights: { some: { account, ...sight } },
    portalCourse: {
      versions: { some: { sights: { some: { account, ...shows(now) } } } },
    },
  };
};

// The posts the viewers see: through the shared account, in a portal read
// as shared and a portal course linked to a course granted, or in a public
// portal; or through their own accounts, in a portal course they see
export const itemSeen = (
  viewers: Viewers,
  now: Date,
  sight: Sight = shows(now),
): Prisma.ItemVersionWhereInput => {
  const { record, ...sharedSight } = shared(viewers, sight);
  const { record: openRecord, ...openSight } = inOpen(viewers, sight);
  return {
    OR: [
      { ...sharedSight, item: record, portalCourse: granted(viewers) },
      { ...openSight, item: openRecord },
      own(viewers, sight, now),
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
  const { record: openRecord, ...openSight } = inOpen(viewers, sight);
  return {
    AND: [
      {
        OR: [
          { ...sharedSight, file: record, portalCourse: granted(viewers) },
          { ...openSight, file: openRecord },
          own(viewers, sight, now),
        ],
      },
      {
        OR: [
          { itemId: null },
          { item: { versions: { some: itemSeen(viewers, now) } } },
        ],
      },
    ],
  };
};

// The sights of a version through which the viewers' view opens it: the
// shared account's in a portal read as shared or a public one, else the
// user's own accounts'. None, and a
// file's content, or a post's body, is the viewers' to see only once
// there is one.
const openingOf = (
  { shared, open, accounts }: Viewers,
  now: Date,
  record: (portal: Prisma.StringFilter) => object,
) => ({
  ...opens(now),
  AND: [
    {
      OR: [
        {
          account: SHARED_ACCOUNT,
          version: record({ notIn: [...shared.except] }),
        },
        { account: SHARED_ACCOUNT, version: record({ in: [...open] }) },
        { account: { in: [...accounts] } },
      ],
    },
  ],
});

export const opening = (
  viewers: Viewers,
  now: Date,
): Prisma.FileSightWhereInput =>
  openingOf(viewers, now, (portal) => ({ file: { portal } }));

export const itemOpening = (
  viewers: Viewers,
  now: Date,
): Prisma.ItemSightWhereInput =>
  openingOf(viewers, now, (portal) => ({ item: { portal } }));

// a portal course's sights through which the viewers see it, as posts are
// seen
export const courseSeen = (
  { shared, open, accounts }: Viewers,
  now: Date,
): Prisma.CourseSightWhereInput => ({
  ...shows(now),
  AND: [
    {
      OR: [
        {
          account: SHARED_ACCOUNT,
          version: { portalCourse: { portal: { notIn: [...shared.except] } } },
        },
        {
          account: SHARED_ACCOUNT,
          version: { portalCourse: { portal: { in: [...open] } } },
        },
        { account: { in: [...accounts] } },
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
