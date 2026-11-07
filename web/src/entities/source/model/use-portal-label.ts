import { useQuery } from '@tanstack/react-query';
import { portalsQuery } from '../api/portals-query';
import { portalLabel } from '../lib/portal-label';

// portal id -> the name it is shown by
export function usePortalLabel() {
  const portals = useQuery(portalsQuery()).data;
  return (portal: string) => portalLabel(portal, portals);
}
