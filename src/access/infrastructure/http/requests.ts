import { StoredText } from '@app/kernel';

// What the REST routes take besides a page of a list or of a text (page.ts),
// checked where the request comes in (ValidationModule): a bad one is a 400.

// a user's id (Better Auth's) or a course's (catalog's): text postgres can
// keep, since a NUL would fail the lookup with a 500
export const recordId = StoredText.min(1);
