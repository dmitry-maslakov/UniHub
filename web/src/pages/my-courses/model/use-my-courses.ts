import { usePrevious } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { coursesQuery } from '@/entities/course';
import { firstSyncOf, portalsQuery, whileFirstSync } from '@/entities/source';

// The user's courses, and the source whose account was just linked and is
// read for the first time, if one is: the courses asked for again every
// 30 s while it is, and once more as it ends, so what it found shows
// without a reload whichever answer comes first
export function useMyCourses() {
  const portals = useQuery(portalsQuery());
  const syncing = firstSyncOf(portals.data);
  const courses = useQuery({
    ...coursesQuery(),
    refetchInterval: whileFirstSync(portals.data),
  });
  const wasSyncing = usePrevious(syncing !== undefined);
  const { refetch } = courses;
  useEffect(() => {
    if (wasSyncing && !syncing) void refetch();
  }, [wasSyncing, syncing, refetch]);
  return { courses, syncing };
}
