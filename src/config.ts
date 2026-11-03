import { z } from 'zod';

// "pdf-text, acs" → ['pdf-text', 'acs']
export const parsePlugins = (value = '') =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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
  STORAGE_PATH: z.string().default('./data/blobs'),
});

export type Env = z.output<typeof envSchema>;
