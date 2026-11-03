import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { admin, bearer, deviceAuthorization } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Mail, Mailer } from '../domain/mailer.js';

// our own apps that may sign in by QR code (device authorization)
export const DEVICE_CLIENTS = ['unihub-web', 'unihub-app'];

export interface AuthDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  secret: string;
  baseURL: string;
  google?: { clientId: string; clientSecret: string };
}

const logger = new Logger('Auth');

export function createAuth({
  prisma,
  mailer,
  secret,
  baseURL,
  google,
}: AuthDeps) {
  // not awaited, so how long sending takes doesn't tell whether an account
  // exists (Better Auth's advice)
  const send = (mail: Mail) =>
    void mailer
      .send(mail)
      .catch((err: unknown) =>
        logger.error(`mail to ${mail.to} failed`, err as Error),
      );

  return betterAuth({
    secret,
    baseURL,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    // Better Auth skips origin checks under NODE_ENV=test; on here, tests see
    // what production does
    advanced: { disableOriginCheck: false },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // a stolen session, or a screen signed in by QR, ends with a reset
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        send({
          to: user.email,
          subject: 'Reset your UniHub password',
          text: `To set a new password, open ${url}`,
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send({
          to: user.email,
          subject: 'Confirm your email for UniHub',
          text: `To confirm your email, open ${url}`,
        }),
    },
    socialProviders: google ? { google } : {},
    plugins: [
      // user roles: an admin decides who reads which course
      admin(),
      // a session token in Authorization, for apps and API clients without
      // cookies, and for the token device sign-in hands out
      bearer(),
      // sign in by QR: a new screen shows a code, a signed-in phone approves it
      deviceAuthorization({
        validateClient: (clientId) => DEVICE_CLIENTS.includes(clientId),
      }),
      // for MCP clients; the default limit of 10 requests a day is for paid
      // APIs, an agent reading courses makes many more
      apiKey({ rateLimit: { timeWindow: 60_000, maxRequests: 600 } }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
