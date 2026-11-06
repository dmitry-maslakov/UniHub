import { z } from 'zod';

// the words searched for, kept in the address so a search can be shared and
// the back button returns to it
export const searchSearch = z.object({
  q: z.string().optional().catch(undefined),
});
