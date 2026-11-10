import { z } from 'zod';
import { StoredText } from '@app/kernel';
import { CourseSlug } from '../../catalog/contracts.js';

// What a search takes, over REST and MCP alike. Coerced, as a query string
// carries text.
export const searchRequest = z.object({
  q: StoredText.min(2)
    .max(500)
    .describe(
      'words, a phrase or a code identifier; Latin or Cyrillic, with or without č ć š ž đ',
    ),
  course: CourseSlug.optional().describe('course slug: search only there'),
  type: z
    .enum(['files', 'posts'])
    .optional()
    .describe(
      'files (files and archive members) or posts only; both when absent',
    ),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('results, at most'),
});
export type SearchRequest = z.output<typeof searchRequest>;

// The REST route's own: a list of the user's courses can leave out the
// ones they don't show, which MCP never does
export const restSearchRequest = searchRequest.extend({
  shown: z
    .stringbool()
    .default(false)
    .describe(
      "true: only the courses you show among yours, none you hide nor a public portal's you didn't pick; ignored with `course`",
    ),
});
export type RestSearchRequest = z.output<typeof restSearchRequest>;
