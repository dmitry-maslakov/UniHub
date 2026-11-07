import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { authClient } from '@/shared/api';

export const USERS_PAGE = 50;

// A page of users, newest first, by Better Auth's admin plugin. Its search
// is `contains` on one field, an email when the words have an @ and a name
// else; on Postgres it is case-sensitive.
export const adminUsersQuery = ({
  q,
  page = 1,
}: {
  q?: string;
  page?: number;
}) =>
  queryOptions({
    queryKey: ['admin', 'users', { q, page }],
    queryFn: () =>
      authClient.admin.listUsers({
        query: {
          limit: USERS_PAGE,
          offset: (page - 1) * USERS_PAGE,
          sortBy: 'createdAt',
          sortDirection: 'desc',
          ...(q && {
            searchValue: q,
            searchField: q.includes('@') ? 'email' : 'name',
            searchOperator: 'contains',
          }),
        },
      }),
    placeholderData: keepPreviousData,
  });
