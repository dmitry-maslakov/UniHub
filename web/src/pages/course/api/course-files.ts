import { queryOptions } from '@tanstack/react-query';
import { fetchClient, readAllPages } from '@/shared/api';

// The tree needs all of a course's files at once (200 a page, up to 2,000)
export const courseFilesQuery = (slug: string) =>
  queryOptions({
    queryKey: ['get', '/api/courses/{slug}/files', { slug, all: true }],
    queryFn: async ({ signal }) => {
      const { items, capped } = await readAllPages(async (offset, limit) => {
        const { data } = await fetchClient.GET('/api/courses/{slug}/files', {
          params: { path: { slug }, query: { offset, limit } },
          signal,
        });
        return data!;
      });
      return { files: items, capped };
    },
  });
