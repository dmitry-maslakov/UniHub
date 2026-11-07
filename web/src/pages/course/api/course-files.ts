import { queryOptions } from '@tanstack/react-query';
import { fetchClient, readAllPages } from '@/shared/api';

// The tree needs all of a course's files at once (200 a page, up to 2,000).
// The course page and its Files tab read it both: a read stays fresh for a
// minute, so the tab opening on it doesn't ask for all of it again.
export const courseFilesQuery = (slug: string) =>
  queryOptions({
    staleTime: 60_000,
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
