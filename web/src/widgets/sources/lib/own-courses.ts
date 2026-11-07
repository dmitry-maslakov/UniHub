import type { Schemas } from '@/shared/api';

const byName = new Intl.Collator('und', { numeric: true });

// The user's courses a pick may show with: those they read through an
// account of their own, by name
export const ownCourses = (courses: readonly Schemas['CourseResponse'][]) =>
  courses
    .filter(({ portalCourses }) =>
      portalCourses.some(({ via }) => via === 'account'),
    )
    .sort((a, b) => byName.compare(a.name, b.name));
