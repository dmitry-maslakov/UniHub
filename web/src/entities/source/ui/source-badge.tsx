import { Badge } from '@mantine/core';
import { useSourceLabel } from '../api/use-source-label';

// Where a course comes from, small and quiet beside its name
export function SourceBadge({ portal }: { portal: string }) {
  return (
    <Badge
      variant="default"
      radius="sm"
      size="md"
      fz="xs"
      tt="none"
      fw={500}
      style={{ flexShrink: 0 }}
    >
      {useSourceLabel(portal)}
    </Badge>
  );
}
