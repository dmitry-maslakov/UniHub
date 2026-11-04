import { z } from 'zod';
import { PluginName, StoredText } from '@app/kernel';
import { textPage } from '../../application/page.js';

// What the REST routes take besides a page of a list (pageSchema), checked
// where the request comes in (ValidationModule): a bad one is a 400.

// one page of a file's text, the first processor's unless one is named
export const textQuery = z.object({
  page: textPage,
  processor: PluginName.optional().describe(
    'which text, the first one by default',
  ),
});

// a user's id (Better Auth's) or a course's (catalog's): text postgres can
// keep, since a NUL would fail the lookup with a 500
export const recordId = StoredText.min(1);
