import type { Schemas } from '@/shared/api';

type Course = Schemas['CourseResponse'];

const byName = new Intl.Collator('und', { numeric: true });

// read through an account of the user's own
const isOwn = ({ portalCourses }: Course) =>
  portalCourses.some(({ via }) => via === 'account');

// The user's courses a pick may show with: those they read through an
// account of their own, by name
export const ownCourses = (courses: readonly Course[]) =>
  courses.filter(isOwn).sort((a, b) => byName.compare(a.name, b.name));

// The course an admin linked a pick to: the one holding it, neither a
// course of its own (`{portal}~{externalId}`) nor one of the user's own.
// There it stays, whatever the user shows it with.
export function linkedCourse(
  courses: readonly Course[],
  portal: string,
  externalId: string,
) {
  const holder = courses.find(({ portalCourses }) =>
    portalCourses.some(
      (pc) => pc.portal === portal && pc.externalId === externalId,
    ),
  );
  return holder && holder.slug !== `${portal}~${externalId}` && !isOwn(holder)
    ? holder
    : undefined;
}
