import { z } from 'zod';
import { Secret, StoredText } from '@app/kernel';
import { pageSchema } from '../../../access/contracts.js';
import { CourseSlug } from '../../../catalog/contracts.js';

// What the routes take, checked where the request comes in
// (ValidationModule): a bad one is a 400, never a call. zod's issues carry
// no input, and these name none either.

// A token as a portal hands it out: visible ASCII, as it goes in a header.
// A Secret from here on; write-only in OpenAPI, as nothing reads it back.
export const tokenRequest = z
  .object({
    token: z
      .string()
      .regex(/^[\x21-\x7e]{1,4096}$/, {
        message: 'a token is 1 to 4096 visible ASCII characters',
      })
      .meta({
        writeOnly: true,
        description: 'a token of your own the portal gave you; never read back',
      }),
  })
  .transform(({ token }) => new Secret(token));

// a course's id as its portal has it; text postgres can't keep would fail
// the lookup with a 500
export const externalId = StoredText.min(1);

// A pick, and the course to show it with: its slug, null for none; left
// out, as it was. No body at all is a pick alone, as {} is.
export const pickRequest = z
  .object({
    into: CourseSlug.nullable()
      .optional()
      .describe(
        'the slug of your course to show it with, one you read through your own account; null to show it on its own; left out, it stays as it was',
      ),
  })
  .optional()
  .transform((body) => body?.into);

// A page of a portal's catalog, and the words its courses' names are to
// have: none, or blank, for every course
export const catalogRequest = pageSchema.extend({
  q: StoredText.trim()
    .max(200)
    .optional()
    .describe(
      "words in a course's name, in any case, with or without diacritics",
    ),
});
