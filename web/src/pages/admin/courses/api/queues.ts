import { api } from '@/shared/api';

// the background queues' counts, asked again every 30 s
export const queuesQuery = () =>
  api.queryOptions('get', '/api/admin/queues', undefined, {
    refetchInterval: 30_000,
  });
