import { z } from 'zod';
import { PluginName } from '@app/kernel';

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

// One page (slide, section) of a file's text, from 1. A file can have a text
// of each processor that takes it, paged apart, so a page a search found is
// read with the processor it names.
export const textPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(FAR).default(1),
  processor: PluginName.optional().describe(
    'which text, as a search result names it; the first one by default',
  ),
});
