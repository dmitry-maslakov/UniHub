import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { admin, bearer, deviceAuthorization } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Mail, Mailer } from '../domain/mailer.js';

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
      // a stolen session, or a screen signed in by QR, ends with a reset;
      // so do the API keys it may have made (they're ours to drop: a key
      // never needs a session to work)
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await prisma.apikey.deleteMany({ where: { referenceId: user.id } });
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
