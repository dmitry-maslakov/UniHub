import { queryOptions } from '@tanstack/react-query';
import { fetchClient, readAllPages } from '@/shared/api';

// The tree needs every member of an archive at once (200 a page, up to
// 2,000); none for a file that holds none
export const archiveMembersQuery = (fileId: string) =>
  queryOptions({
    queryKey: ['get', '/api/files/{id}/members', { fileId, all: true }],
    queryFn: async ({ signal }) => {
      const { items, capped } = await readAllPages(async (offset, limit) => {
        const { data } = await fetchClient.GET('/api/files/{id}/members', {
          params: { path: { id: fileId }, query: { offset, limit } },
          signal,
        });
        return data!;
      });
      return { members: items, capped };
    },
  });
