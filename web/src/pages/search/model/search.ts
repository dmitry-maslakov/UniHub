import { z } from 'zod';

// the words searched for, the course to look in if only one, what to look
// through if not both, and, when the course was named by its initials in the
// words, those words as typed (to put back): kept in the address so a search
// can be shared and the back button returns to it
export const searchSearch = z.object({
  q: z.string().trim().optional().catch(undefined),
  course: z.string().trim().min(1).optional().catch(undefined),
  type: z.enum(['files', 'posts']).optional().catch(undefined),
  from: z.string().trim().min(1).optional().catch(undefined),
});
