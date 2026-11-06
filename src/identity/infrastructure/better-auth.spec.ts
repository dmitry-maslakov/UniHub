import { betterAuth } from 'better-auth';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createAuth } from './better-auth.js';

// Better Auth's CLI (auth:generate, auth:create-admin) takes the options of
// the auth auth.cli.ts exports and builds an auth of its own from them, so
// every plugin starts twice on the same plugin objects. Nothing here reaches
// the database.
describe('the auth', () => {
  it('starts again from its own options, as the CLI starts it', async () => {
    const auth = createAuth({
      prisma: {} as PrismaClient,
      mailer: { send: async () => {} },
      secret: 'spec-secret-spec-secret-spec-secret-spec',
      baseURL: 'https://hub.example',
      trustedOrigins: [],
      fetchClientMetadata: async () => new Response(null, { status: 404 }),
      onUserDeleted: () => {},
    });
    await auth.$context;
    await expect(betterAuth(auth.options).$context).resolves.toBeDefined();
  });
});
