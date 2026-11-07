import { z } from 'zod';

// the tab a course shows, kept in the address; none asks for the default
export const courseSearch = z.object({
  tab: z.enum(['files', 'posts']).optional().catch(undefined),
});
