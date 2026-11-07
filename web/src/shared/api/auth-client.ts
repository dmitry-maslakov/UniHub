import { apiKeyClient } from '@better-auth/api-key/client';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import {
  adminClient,
  deviceAuthorizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Better Auth on the hub's own origin, /api/auth. A failed call throws, as
// TanStack Query expects. oauthProviderClient carries the signed query an
// OAuth client sends to /sign-in into the sign-in call itself.
export const authClient = createAuthClient({
  plugins: [
    deviceAuthorizationClient(),
    apiKeyClient(),
    oauthProviderClient(),
    // the user's role, and the admin calls the hub's server checks
    adminClient(),
  ],
  fetchOptions: { throw: true },
});

export type Session = typeof authClient.$Infer.Session;
