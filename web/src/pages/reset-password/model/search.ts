import { z } from 'zod';

// The mail's link comes back through Better Auth as ?token=, or as
// ?error=INVALID_TOKEN once it has expired or was used
export const resetPasswordSearch = z.object({
  token: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});
