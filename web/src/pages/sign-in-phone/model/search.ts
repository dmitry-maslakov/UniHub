import { z } from 'zod';

// where to go once signed in, as on /sign-in
export const signInPhoneSearch = z.object({
  next: z.string().optional().catch(undefined),
});
