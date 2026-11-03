// Better Auth's own CLI loads this: npm run auth:generate (schema) and
// npm run auth:create-admin. The app builds its auth in IdentityModule.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { createAuth } from './infrastructure/better-auth.js';

export const auth = createAuth({
  prisma: new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }),
  mailer: { send: async () => {} },
  secret: process.env.BETTER_AUTH_SECRET ?? '',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  // so the schema covers Google accounts too
  google: { clientId: 'cli', clientSecret: 'cli' },
});
