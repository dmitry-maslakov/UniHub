import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api, authClient } from '@/shared/api';

// the users granted a course
export const readersQuery = (courseId: string) =>
  api.queryOptions('get', '/api/admin/courses/{courseId}/readers', {
    params: { path: { courseId } },
  });

export const READER_CANDIDATES = 20;

// users to give access to: by Better Auth's admin plugin, an email when the
// words have an @, a name else
export const candidatesQuery = (q: string) =>
  queryOptions({
    queryKey: ['admin', 'users', 'candidates', q],
    queryFn: () =>
      authClient.admin.listUsers({
        query: {
          limit: READER_CANDIDATES,
          sortBy: 'name',
          sortDirection: 'asc',
          ...(q && {
            searchValue: q,
            searchField: q.includes('@') ? 'email' : 'name',
            searchOperator: 'contains',
          }),
        },
      }),
    placeholderData: keepPreviousData,
  });
