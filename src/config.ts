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
  // built-in plugins to turn on, comma separated
  PLUGINS: z.string().default('').transform(parsePlugins),
  STORAGE_PATH: z.string().default('./data/blobs'),
});

export type Env = z.output<typeof envSchema>;
