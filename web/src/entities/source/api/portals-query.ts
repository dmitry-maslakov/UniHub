import { api } from '@/shared/api';
import { whileFirstSync } from '../lib/first-sync';

// The sources the hub lists to the user (their accounts, a public site's
// catalog), shared by everything that reads them; invalidated by the prefix
// ['get', '/api/me/portals']. Asked again while an account just linked is
// read for the first time, so the page says when that ends.
export const portalsQuery = () =>
  api.queryOptions('get', '/api/me/portals', undefined, {
    staleTime: 5 * 60_000,
    refetchInterval: (query) => whileFirstSync(query.state.data),
  });
