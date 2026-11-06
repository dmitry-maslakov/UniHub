import { z } from 'zod';

// as sign-in's: where to go once the email is confirmed, the rest kept
export const signUpSearch = z.looseObject({
  next: z.string().optional().catch(undefined),
});
