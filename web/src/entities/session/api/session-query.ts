import { queryOptions } from '@tanstack/react-query';
import { authClient } from '@/shared/api';

// who is signed in, or null: what the guarded routes and the shell read
export const sessionQuery = () =>
  queryOptions({
    queryKey: ['session'],
    queryFn: () => authClient.getSession(),
    staleTime: 60_000,
  });
