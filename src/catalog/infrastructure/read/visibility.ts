import type { Prisma } from '../../../generated/prisma/client.js';
import { seenByShared } from '../rows.js';

// The files a course shows: in the shared account's view, not attached to
// a post that isn't (attachments go with their post), in a portal course
// linked to the course (to any course, without one). The listings and the
// single file all read through it, so a file can't be listed or searched
// and then not be found, or the other way round.
export const visibleFile = (
  course?: Prisma.CourseLinkWhereInput,
): Prisma.FileVersionWhereInput => ({
  sights: seenByShared,
  OR: [
    { itemId: null },
    { item: { versions: { some: { sights: seenByShared } } } },
  ],
  portalCourse: { link: course ? { is: course } : { isNot: null } },
});

// The posts a course shows: in the shared account's view, in a portal
// course linked to the course (to any course, without one), as visibleFile
// says of files.
export const visibleItem = (
  course?: Prisma.CourseLinkWhereInput,
): Prisma.ItemVersionWhereInput => ({
  sights: seenByShared,
  portalCourse: { link: course ? { is: course } : { isNot: null } },
});
