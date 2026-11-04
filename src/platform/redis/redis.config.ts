import { z } from 'zod';
import { settings } from '../config/settings.js';

export const redisConfig = settings(
  'redis',
  z
    .object({ REDIS_URL: z.url().default('redis://localhost:6379') })
    .transform((env) => ({ url: env.REDIS_URL })),
);
