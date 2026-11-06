import { QueryClient } from '@tanstack/react-query';
import { authError } from '@/shared/api';

// a request the server refused is refused again: only a failure is retried
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          failures < 2 && (authError(error)?.status ?? 500) >= 500,
      },
    },
  });
