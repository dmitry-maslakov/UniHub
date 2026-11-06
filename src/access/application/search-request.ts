import { z } from 'zod';
import { StoredText } from '@app/kernel';
import { Slug } from '../../catalog/contracts.js';

// What a search takes, over REST and MCP alike. Coerced, as a query string
// carries text.
export const searchRequest = z.object({
  q: StoredText.min(2)
    .max(500)
    .describe(
      'words, a phrase or a code identifier; Latin or Cyrillic, with or without č ć š ž đ',
    ),
  course: Slug.optional().describe('course slug: search only there'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('results, at most'),
});
export type SearchRequest = z.output<typeof searchRequest>;
