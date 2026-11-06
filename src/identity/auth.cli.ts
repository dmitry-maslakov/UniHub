// Better Auth's own CLI loads this: npm run auth:generate (schema) and
// npm run auth:create-admin. The app builds its auth in IdentityModule, from
// the same settings.
import 'dotenv/config';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { databaseConfig } from '../platform/database/database.config.js';
import { identityConfig } from './identity.config.js';
import { createAuth } from './infrastructure/better-auth.js';

const { secret, baseURL } = identityConfig();

export const auth = createAuth({
  prisma: new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseConfig().url }),
  }),
  mailer: { send: async () => {} },
  secret,
  baseURL,
  trustedOrigins: [],
  // so the schema covers Google accounts too
  google: { clientId: 'cli', clientSecret: 'cli' },
  // it fetches no OAuth clients
  fetchClientMetadata: fetchClientMetadataResource,
  // it deletes no users
  onUserDeleted: () => {},
});
