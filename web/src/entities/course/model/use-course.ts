import { useQuery } from '@tanstack/react-query';
import { coursesQuery } from '../api/courses-query';

// One of the user's courses by its slug, from the list; `query` for its
// loading and failing, `course` undefined while it loads or when it isn't
// one of theirs
export function useCourse(slug: string) {
  const query = useQuery(coursesQuery());
  return { query, course: query.data?.find((c) => c.slug === slug) };
}
