import { z } from 'zod';

// the words searched for and the page, kept in the address so a search can
// be shared and the back button returns to it
export const usersSearch = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});
