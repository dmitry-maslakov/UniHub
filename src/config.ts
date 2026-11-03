import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().default(3000),
  STORAGE_PATH: z.string().default('./data/blobs'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): Env {
  return envSchema.parse(env);
}
