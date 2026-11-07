import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';

// every course an admin made, with what it links and how many read it
export const hubCoursesQuery = () =>
  api.queryOptions('get', '/api/admin/courses');

// after anything that changes what the list shows
export const invalidateHubCourses = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: ['get', '/api/admin/courses'] });
