import { useQuery } from '@tanstack/react-query';
import { courseQuery, coursesQuery } from '../api/courses-query';

// One course by its slug: from the user's list when it's there, else asked
// for by itself (a public site's course they didn't pick is read too).
// `query` is its loading and failing, for QueryState: a 404 when it isn't
// theirs to read
export function useCourse(slug: string) {
  const list = useQuery(coursesQuery());
  const listed = list.data?.find((c) => c.slug === slug);
  const one = useQuery({
    ...courseQuery(slug),
    enabled: list.isSuccess && !listed,
    retry: false,
  });
  const from = listed || !list.isSuccess ? list : one;
  const course = listed ?? one.data;
  return {
    course,
    query: {
      isPending: from.isPending,
      isError: from.isError,
      error: from.error,
      data: course,
      refetch: from.refetch,
    },
  };
}
