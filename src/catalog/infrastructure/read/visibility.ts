import type { Prisma } from '../../../generated/prisma/client.js';

// The files a course shows: not removed, not attached to a removed post
// (attachments go with their post), in a portal course linked to the course
// (to any course, without one). The listing and the single file both read
// through it, so a file can't be listed and then not be found, or the other
// way round.
export const visibleFile = (
  course?: Prisma.CourseLinkWhereInput,
): Prisma.FileWhereInput => ({
  removedAt: null,
  OR: [{ itemId: null }, { item: { removedAt: null } }],
  portalCourse: { link: course ? { is: course } : { isNot: null } },
});
