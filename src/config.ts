import { z } from 'zod';
import { PluginName, PortalId } from '@app/kernel';

// "pdf-text, acs" → ['pdf-text', 'acs']
export const parseList = (value = '') =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// "acs=token1, teams=token2" → [['acs', 'token1'], ['teams', 'token2']]
export const parseConnectorTokens = (value = '') =>
  parseList(value).map((pair) => {
    const at = pair.indexOf('=');
    // no "=": no portal, so validation rejects it
    if (at < 0) return ['', pair] as const;
    return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()] as const;
  });

const validTokens = (value: string) => {
  const pairs = parseConnectorTokens(value);
  const tokens = new Set(pairs.map(([, token]) => token));
  return (
    tokens.size === pairs.length &&
    pairs.every(
      ([portal, token]) => PortalId.isValid(portal) && token.length >= 16,
    )
  );
};

// "https://app.example.com", nothing more: no path, no wildcard
const isOrigin = (value: string) => {
  try {
    const url = new URL(value);
    return !value.includes('*') && url.origin === value;
  } catch {
    return false;
  }
};

export const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().default(3000),
    REDIS_URL: z.url().default('redis://localhost:6379'),
    // built-in plugins to turn on, comma separated. Kept a string: ConditionalModule
    // reads it from process.env, where only plain values get copied
    PLUGINS: z
      .string()
      .default('')
      .refine((v) => parseList(v).every(PluginName.isValid), {
        message: 'plugin names are lower-case letters, digits and dashes',
      }),
    // this instance starts push connectors (one instance should)
    RUN_CONNECTORS: z.stringbool().default(true),
    // external connectors connect here over gRPC, which has no TLS of its own:
    // keep it on a private network or behind a TLS proxy
    GRPC_URL: z.string().default('127.0.0.1:50051'),
    // "portal=token,portal=token" until connectors get real credentials
    CONNECTOR_TOKENS: z.string().default('').refine(validTokens, {
      message:
        'portal=token pairs: portal names are lower-case letters, digits and dashes, tokens are unique and at least 16 characters',
    }),
    STORAGE_PATH: z.string().default('./data/blobs'),
    // signs sessions and tokens: openssl rand -base64 32
    BETTER_AUTH_SECRET: z.string().min(32),
    // where users reach the hub; links in mails point here
    BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
    // smtp://user:pass@host:587; without it mails are only logged
    SMTP_URL: z.string().default(''),
    MAIL_FROM: z.string().default('UniHub <no-reply@localhost>'),
    // other sites (the web app) allowed to call the API with cookies, comma
    // separated; they get CORS too
    TRUSTED_ORIGINS: z
      .string()
      .default('')
      .refine((v) => parseList(v).every(isOrigin), {
        message:
          'exact origins like https://app.example.com: Better Auth reads * as a wildcard',
      }),
    // how many proxies in front of the app set X-Forwarded-For (caddy: 1)
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Google sign-in is on when both are set
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
  })
  // mails carry sign-in links: in production they must really be sent, and
  // point at the real address
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.SMTP_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'required in production',
      });
    if (new URL(env.BETTER_AUTH_URL).protocol !== 'https:')
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'must be the public https address in production',
      });
  });

export type Env = z.output<typeof envSchema>;
