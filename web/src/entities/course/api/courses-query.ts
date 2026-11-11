import { api } from '@/shared/api';

// The user's courses, those they hide too, with where each comes from
export const coursesQuery = () => api.queryOptions('get', '/api/courses');

// One course the user reads, theirs or not: a public site's they didn't
// pick too. Also what says whether the user may read it at all
export const courseQuery = (slug: string) =>
  api.queryOptions('get', '/api/courses/{slug}', {
    params: { path: { slug } },
  });
