import { StoredText } from '@app/kernel';
import { pageSchema } from '../../application/page.js';

// What the REST routes take besides a page of a list or of a text (page.ts),
// checked where the request comes in (ValidationModule): a bad one is a 400.

// a user's id (Better Auth's) or a course's (catalog's): text postgres can
// keep, since a NUL would fail the lookup with a 500
export const recordId = StoredText.min(1);

// A page of the portal courses to link, and the words their names are to
// have: none, or blank, for every one
export const linkableSchema = pageSchema.extend({
  q: StoredText.trim()
    .max(200)
    .optional()
    .describe(
      "words in a portal course's name, in any case, with or without diacritics",
    ),
});
