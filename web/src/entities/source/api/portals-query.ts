import { api } from '@/shared/api';

// The sources the hub lists to the user (their accounts, a public site's
// catalog), shared by everything that reads them; invalidated by the prefix
// ['get', '/api/me/portals']
export const portalsQuery = () =>
  api.queryOptions('get', '/api/me/portals', undefined, {
    staleTime: 5 * 60_000,
  });
