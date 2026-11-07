import { api } from '@/shared/api';

// The courses the user reads, with where each comes from; also what says
// whether the user may read one at all
export const coursesQuery = () => api.queryOptions('get', '/api/courses');
