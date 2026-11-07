import { queryOptions } from '@tanstack/react-query';
import { fetchClient, type Schemas } from '@/shared/api';

// every file of a course, 200 a page, up to 10 pages
export const FILES_PAGE = 200;
export const FILES_CAP = 2000;

// The tree needs all of a course's files at once, so they are read page by
// page until a short one, or the cap
export const courseFilesQuery = (slug: string) =>
  queryOptions({
    queryKey: ['get', '/api/courses/{slug}/files', { slug, all: true }],
    queryFn: async ({ signal }) => {
      const files: Schemas['FileResponse'][] = [];
      for (let offset = 0; offset < FILES_CAP; offset += FILES_PAGE) {
        const { data } = await fetchClient.GET('/api/courses/{slug}/files', {
          params: {
            path: { slug },
            query: { offset, limit: FILES_PAGE },
          },
          signal,
        });
        files.push(...data!);
        if (data!.length < FILES_PAGE) return { files, capped: false };
      }
      return { files, capped: true };
    },
  });
