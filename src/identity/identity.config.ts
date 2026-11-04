import { z } from 'zod';
import { list, settings } from '../platform/config/settings.js';

// "https://app.example.com", nothing more: no path, no wildcard
const isOrigin = (value: string) => {
  try {
    return !value.includes('*') && new URL(value).origin === value;
  } catch {
    return false;
  }
};

export const identitySettings = z
  .object({
    NODE_ENV: z.string().default('development'),
    // signs sessions and tokens: openssl rand -base64 32
    BETTER_AUTH_SECRET: z.string().min(32),
    // where users reach the hub; links in mails point here
    BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
    // other sites (the web app) allowed to call the API with cookies; they
    // get CORS too
    TRUSTED_ORIGINS: list.pipe(
      z.array(
        z.string().refine(isOrigin, {
          message:
            'exact origins like https://app.example.com: Better Auth reads * as a wildcard',
        }),
      ),
    ),
    // Google sign-in is on when both are set
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
  })
  // links in mails point at it: in production, the real address
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      new URL(env.BETTER_AUTH_URL).protocol !== 'https:'
    )
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'must be the public https address in production',
      });
  })
  .transform((env) => ({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: env.TRUSTED_ORIGINS,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
  }));

export const identityConfig = settings('identity', identitySettings);
