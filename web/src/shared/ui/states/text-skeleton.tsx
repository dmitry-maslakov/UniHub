import { Skeleton, Stack } from '@mantine/core';

// Text on its way: lines, the last one short, announced as loading
export function TextSkeleton({
  lines = 4,
  label,
}: {
  lines?: number;
  label: string;
}) {
  return (
    <Stack component="output" gap={10} aria-label={label}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={14} w={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </Stack>
  );
}
