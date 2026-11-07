import { Badge } from '@mantine/core';
import { usePortalLabel } from '../model/use-portal-label';

// Where a course comes from, small and quiet beside its name
export function SourceBadge({ portal }: { portal: string }) {
  const label = usePortalLabel();
  return <Badge style={{ flexShrink: 0 }}>{label(portal)}</Badge>;
}
