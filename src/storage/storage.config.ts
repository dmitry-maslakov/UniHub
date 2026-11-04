import { resolve } from 'node:path';
import { z } from 'zod';
import { settings } from '../platform/config/settings.js';

const MIB = 1024 * 1024;

export const storageSettings = z
  .object({
    // where file content is kept: a local folder for now
    STORAGE_PATH: z.string().default('./data/blobs'),
    // the largest file content kept, in MiB
    STORAGE_MAX_FILE_MB: z.coerce.number().int().positive().default(1024),
  })
  .transform((env) => ({
    location: resolve(env.STORAGE_PATH),
    maxBytes: env.STORAGE_MAX_FILE_MB * MIB,
  }));

export const storageConfig = settings('storage', storageSettings);
