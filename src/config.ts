import { z } from 'zod';

// "pdf-text, acs" → ['pdf-text', 'acs']
export const parsePlugins = (value = '') =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// "acs=token1, teams=token2" → [['acs', 'token1'], ['teams', 'token2']]
export const parseConnectorTokens = (value = '') =>
  parsePlugins(value).map((pair) => {
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
      ([portal, token]) => /^[a-z0-9-]+$/.test(portal) && token.length >= 16,
    )
  );
};

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  // built-in plugins to turn on, comma separated. Kept a string: ConditionalModule
  // reads it from process.env, where only plain values get copied
  PLUGINS: z
    .string()
    .default('')
    .refine((v) => parsePlugins(v).every((n) => /^[a-z0-9-]+$/.test(n)), {
      message: 'plugin names are lower-case letters, digits and dashes',
    }),
  // this instance starts push connectors (one instance should)
  RUN_CONNECTORS: z.stringbool().default(true),
  // external connectors connect here over gRPC
  GRPC_URL: z.string().default('0.0.0.0:50051'),
  // "portal=token,portal=token" until connectors get real credentials
  CONNECTOR_TOKENS: z.string().default('').refine(validTokens, {
    message:
      'portal=token pairs: portal names are lower-case letters, digits and dashes, tokens are unique and at least 16 characters',
  }),
  STORAGE_PATH: z.string().default('./data/blobs'),
});

export type Env = z.output<typeof envSchema>;
