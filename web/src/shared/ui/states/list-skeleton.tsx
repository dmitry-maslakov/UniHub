import { Box, Skeleton, Stack } from '@mantine/core';
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
    <Box component="output" display="block" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Stack key={i} gap={10} className={classes.row}>
          <Skeleton h={16} w="40%" />
          <Skeleton h={14} w="65%" />
        </Stack>
      ))}
    </Box>
  );
}
