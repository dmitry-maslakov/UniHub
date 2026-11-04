import { z } from 'zod';
import { settings } from '../config/settings.js';

export const opensearchSettings = z
  .object({
    OPENSEARCH_URL: z.url(),
    // indices and pipelines are named after it; the node creates none of
    // unihub-* by itself (action.auto_create_index)
    OPENSEARCH_INDEX_PREFIX: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .default('unihub'),
  })
  .transform((env) => ({
    url: env.OPENSEARCH_URL,
    prefix: env.OPENSEARCH_INDEX_PREFIX,
  }));

export const opensearchConfig = settings('opensearch', opensearchSettings);
