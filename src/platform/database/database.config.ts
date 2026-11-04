import { z } from 'zod';
import { settings } from '../config/settings.js';

export const databaseSettings = z
  .object({ DATABASE_URL: z.url() })
  .transform((env) => ({ url: env.DATABASE_URL }));

export const databaseConfig = settings('database', databaseSettings);
