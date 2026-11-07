import { queryOptions } from '@tanstack/react-query';
import { authClient } from '@/shared/api';

// every browser and screen signed in to the account
export const sessionsQuery = () =>
  queryOptions({
    queryKey: ['auth', 'sessions'],
    queryFn: () => authClient.listSessions(),
  });
