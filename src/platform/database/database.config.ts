import { z } from 'zod';
import { settings } from '../config/settings.js';

export const databaseConfig = settings(
  'database',
  z
    .object({ DATABASE_URL: z.url() })
    .transform((env) => ({ url: env.DATABASE_URL })),
);
