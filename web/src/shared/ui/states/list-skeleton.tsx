import { Box, Skeleton, Stack, VisuallyHidden } from '@mantine/core';
import classes from './states.module.css';

// A list on its way: rows of two lines, announced as loading
export function ListSkeleton({
  rows = 3,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <Box component="output" display="block">
      <VisuallyHidden>{label}</VisuallyHidden>
      {Array.from({ length: rows }, (_, i) => (
        <Stack key={i} gap={10} className={classes.row} aria-hidden>
          <Skeleton h={16} w="40%" />
          <Skeleton h={14} w="65%" />
        </Stack>
      ))}
    </Box>
  );
}
