import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { admin, bearer, deviceAuthorization } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Mail, Mailer } from '../domain/mailer.js';
import { ADMIN_ROLE } from '../domain/reader.js';

// our own apps that may sign in by QR code (device authorization)
export const DEVICE_CLIENTS = ['unihub-web', 'unihub-app'];

// 90 days; the plugin reads it in seconds, whatever its docs say
export const API_KEY_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

export interface AuthDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  google?: { clientId: string; clientSecret: string };
}

const logger = new Logger('Auth');

export function createAuth({
  prisma,
  mailer,
  secret,
  baseURL,
  trustedOrigins,
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

  // A new password ends the API keys made under the old one: a stolen
  // session, or a screen signed in by QR, may have made some, and a key
  // never needs a session to work. The plugin has no call for all of a
  // user's keys; it keeps them in the database only (no secondaryStorage
  // here), so this is all of them.
  const dropApiKeys = (userId: string) =>
    prisma.apikey.deleteMany({ where: { referenceId: userId } });

  return betterAuth({
    secret,
    baseURL,
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    // Better Auth skips origin checks under NODE_ENV=test; on here, tests see
    // what production does
    advanced: {
      disableOriginCheck: false,
      // work that can wait until the response is out (API key bookkeeping)
      backgroundTasks: {
        handler: (task) =>
          void task.catch((err: unknown) =>
            logger.error('background task failed', err as Error),
          ),
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // a stolen session, or a screen signed in by QR, ends with a reset
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await dropApiKeys(user.id);
      },
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
    // the other ways to a new password: the user's own change, an admin's
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (isAPIError(ctx.context.returned)) return;
        const userId =
          ctx.path === '/change-password'
            ? ctx.context.session?.user.id
            : ctx.path === '/admin/set-user-password'
              ? (ctx.body as { userId?: string }).userId
              : undefined;
        if (userId) await dropApiKeys(userId);
      }),
    },
    plugins: [
      // user roles: an admin decides who reads which course
      admin({ adminRoles: [ADMIN_ROLE] }),
      // a session token in Authorization, for apps and API clients without
      // cookies, and for the token device sign-in hands out
      bearer(),
      // sign in by QR: a new screen shows a code, a signed-in phone approves it
      deviceAuthorization({
        validateClient: (clientId) => DEVICE_CLIENTS.includes(clientId),
      }),
      // for MCP clients. The plugin's limit only resets after a quiet
      // window, so a steadily working agent gets locked out; MCP routes
      // throttle per key instead (#16)
      // a key's last use is written after the answer, not before it.
      // Keys expire; clients can't pick their own expiry, since
      // /api-key/update with expiresIn: null would make a key permanent
      apiKey({
        rateLimit: { enabled: false },
        deferUpdates: true,
        keyExpiration: {
          defaultExpiresIn: API_KEY_LIFETIME_SECONDS,
          disableCustomExpiresTime: true,
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
