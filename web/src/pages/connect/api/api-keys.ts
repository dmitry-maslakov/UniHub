import { queryOptions } from '@tanstack/react-query';
import { authClient } from '@/shared/api';

// the user's keys, newest first; never the keys themselves, only how they start
export const apiKeys = () =>
  queryOptions({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { apiKeys: keys } = await authClient.apiKey.list();
      return keys.toSorted(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      );
    },
  });
