import { ConditionalModule } from '@nestjs/config';
import { z } from 'zod';
import { settings } from '../config/settings.js';

export const opensearchSettings = z
  .object({
    OPENSEARCH_URL: z.url(),
    // indices are named <prefix>-…, so it stays under unihub-*, the indices
    // action.auto_create_index keeps the node from creating on a write: a
    // lost one would come back without the mapping
    OPENSEARCH_INDEX_PREFIX: z
      .string()
      .regex(/^unihub(-[a-z0-9]+)*$/)
      .default('unihub'),
  })
  .transform((env) => ({
    url: env.OPENSEARCH_URL,
    prefix: env.OPENSEARCH_INDEX_PREFIX,
  }));

export const opensearchConfig = settings('opensearch', opensearchSettings);

// Search is on with OPENSEARCH_URL, for each module with a part in it, so the
// index and what reads it come and go together. The function form: a string
// one would load the module when the variable isn't set.
export const whenSearchOn = (
  module: Parameters<typeof ConditionalModule.registerWhen>[0],
) =>
  ConditionalModule.registerWhen(module, (env) => Boolean(env.OPENSEARCH_URL));
