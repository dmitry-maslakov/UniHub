import { z } from 'zod';

// Where a list or a text is read from, for REST and MCP alike: checked where
// the request comes in, so a page past the bounds never reaches a query.

// far past any real list or text, small enough for postgres' int
const FAR = 1_000_000_000;

// A page of a list. Coerced, since a query string carries text; an array
// (?limit=1&limit=2) isn't a number.
export const pageSchema = z.object({
  offset: z.coerce.number().int().min(0).max(FAR).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type Page = z.output<typeof pageSchema>;

// one page (slide, section) of a file's text, from 1
export const textPage = z.coerce.number().int().min(1).max(FAR).default(1);
