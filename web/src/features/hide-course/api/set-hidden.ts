import { fetchClient } from '@/shared/api';

// a course hidden from My courses, or shown there again: read as before
// either way, by its address, by search and by the user's AI apps
export const setHidden = (slug: string, hidden: boolean) => {
  const course = { params: { path: { slug } } };
  return hidden
    ? fetchClient.PUT('/api/courses/{slug}/hidden', course)
    : fetchClient.DELETE('/api/courses/{slug}/hidden', course);
};
