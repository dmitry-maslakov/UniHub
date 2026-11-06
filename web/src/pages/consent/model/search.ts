import { z } from 'zod';

// What the app asking sent, signed by Better Auth: it all goes back to the
// server as it came, so every other key stays
export const consentSearch = z.looseObject({
  client_id: z.string().optional().catch(undefined),
  redirect_uri: z.string().optional().catch(undefined),
  sig: z.string().optional().catch(undefined),
});
