import { z } from 'zod';

// where a file is read, kept in the address: the part (page, slide), which
// text, a file inside an archive, and the search it was opened from
export const fileSearch = z.object({
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  processor: z.string().min(1).optional().catch(undefined),
  member: z.string().min(1).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  // the course that search was limited to, if it was
  course: z.string().min(1).optional().catch(undefined),
  // and the kind it was limited to, and the words as typed when the course
  // was named by its initials
  type: z.enum(['files', 'posts']).optional().catch(undefined),
  from: z.string().min(1).optional().catch(undefined),
});
