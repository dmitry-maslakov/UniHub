import { z } from 'zod';

export const checkEmailSearch = z.object({
  email: z.string().optional().catch(undefined),
  next: z.string().optional().catch(undefined),
});
