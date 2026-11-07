import { keepPreviousData } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const LINKABLE_PAGE = 50;

// the shared and public portals' courses whose names have the words, by name
export const linkableQuery = (q: string) =>
  api.queryOptions(
    'get',
    '/api/admin/portal-courses',
    { params: { query: { limit: LINKABLE_PAGE, ...(q && { q }) } } },
    { placeholderData: keepPreviousData },
  );
