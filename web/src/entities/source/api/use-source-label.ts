import { api } from '@/shared/api';

// The name a portal is shown by, as the hub labels it; its id while the
// portals load, or for one the hub doesn't list to the user
export function useSourceLabel(portal: string) {
  const portals = api.useQuery('get', '/api/me/portals');
  return portals.data?.find((p) => p.portal === portal)?.label ?? portal;
}
