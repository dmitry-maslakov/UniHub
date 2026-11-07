import { useQuery } from '@tanstack/react-query';
import { coursesQuery } from '../api/courses-query';

// course slug -> its name; the slug while the courses load
export function useCourseNames() {
  const courses = useQuery(coursesQuery()).data;
  return (slug: string) => courses?.find((c) => c.slug === slug)?.name ?? slug;
}
