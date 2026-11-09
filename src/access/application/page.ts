import { z } from 'zod';
import { PluginName, StoredText } from '@app/kernel';

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

// A course's files: a page of them, or those attached to one post
export const courseFilesSchema = pageSchema.extend({
  item: z
    .uuid()
    .optional()
    .describe('only the files attached to this post, by its id'),
});
export type FilesAt = z.output<typeof courseFilesSchema>;

// A member of an archive (or another container) a file holds, by its path
// as the file's members list it; without one, the file itself. As long as
// the hub keeps a path, its letters composed as the hub's are (a Mac's
// client may send them apart).
export const memberSchema = z.object({
  member: StoredText.min(1)
    .max(1024)
    .overwrite((path) => path.normalize('NFC'))
    .optional()
    .describe(
      'a file inside it, by its path as list_members or the members route gives it; the file itself by default',
    ),
});

// One page (slide, section) of a file's text, from 1. A file can have a text
// of each processor that takes it, paged apart, so a page a search found is
// read with the processor it names.
export const textPageSchema = memberSchema.extend({
  page: z.coerce.number().int().min(1).max(FAR).default(1),
  processor: PluginName.optional().describe(
    'which text, as a search result names it; the first one by default',
  ),
});
export type TextAt = z.output<typeof textPageSchema>;
export type MemberAt = z.output<typeof memberSchema>;

// A file's bytes: as a download, or in the browser for the few types it
// shows safely (inline.ts)
export const contentSchema = memberSchema.extend({
  disposition: z
    .enum(['attachment', 'inline'])
    .default('attachment')
    .describe(
      'inline asks the browser to show a PDF, picture or plain text itself; anything else is sent as a download whatever is asked',
    ),
});
export type ContentAt = z.output<typeof contentSchema>;

// A file as a picture: the image itself, or one page of a PDF (from 1)
export const viewSchema = memberSchema.extend({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(FAR)
    .default(1)
    .describe('the page of a PDF, from 1; an image has one'),
});
export type ViewAt = z.output<typeof viewSchema>;
