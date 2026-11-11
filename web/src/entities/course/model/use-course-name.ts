import { useCourse } from './use-course';

// a course's name by its slug; the slug while it loads
export function useCourseName(slug: string) {
  return useCourse(slug).course?.name ?? slug;
}
