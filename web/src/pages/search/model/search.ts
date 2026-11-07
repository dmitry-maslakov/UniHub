import { z } from 'zod';

// the words searched for, and the course to look in if only one, kept in
// the address so a search can be shared and the back button returns to it
export const searchSearch = z.object({
  q: z.string().trim().optional().catch(undefined),
  course: z.string().trim().min(1).optional().catch(undefined),
});
