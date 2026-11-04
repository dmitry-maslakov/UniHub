import { resolve } from 'node:path';
import { z } from 'zod';
import { settings } from '../platform/config/settings.js';

// where file content is kept: a local folder for now
export const storageConfig = settings(
  'storage',
  z
    .object({ STORAGE_PATH: z.string().default('./data/blobs') })
    .transform((env) => ({ location: resolve(env.STORAGE_PATH) })),
);
