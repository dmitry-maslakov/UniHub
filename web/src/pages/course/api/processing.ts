import { api } from '@/shared/api';

export const PROCESSING_REFRESH = 30_000;

// How far the hub has read the course's files, asked again every 30 s while
// anything waits
export const courseProcessingQuery = (slug: string) =>
  api.queryOptions(
    'get',
    '/api/courses/{slug}/processing',
    { params: { path: { slug } } },
    {
      refetchInterval: ({ state }) =>
        state.data && (state.data.waiting.text || state.data.waiting.pictures)
          ? PROCESSING_REFRESH
          : false,
    },
  );
