import { z } from 'zod';

// where to go once signed in; Google's errors come back as ?error=. Other
// keys stay: an OAuth client's signed query goes on to sign-up as it came
export const signInSearch = z.looseObject({
  next: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});
