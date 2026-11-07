import { z } from 'zod';
import { Instance, Secret, StoredText } from '@app/kernel';
import { pageSchema } from '../../../access/contracts.js';
import type { SealedCredential } from '../../domain/credential-vault.js';

// What the routes take, checked where the request comes in
// (ValidationModule): a bad one is a 400, never a call. zod's issues carry
// no input, and these name none either.

// A token as a portal hands it out: visible ASCII, as it goes in a header.
// A Secret from here on; write-only in OpenAPI, as nothing reads it back.
// With it, for a portal that is a site per school (Canvas), the address of
// the school's: any page of it, made its origin.
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
    url: z.string().max(2048).pipe(Instance).optional().meta({
      description:
        "your school's address on a portal that is a site per school (Canvas), https://canvas.example.edu; none for any other",
    }),
  })
  .transform(({ token, url }): SealedCredential => ({
    token: new Secret(token),
    url: url ?? null,
  }));

// a course's id as its portal has it; text postgres can't keep would fail
// the lookup with a 500
export const externalId = StoredText.min(1);

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
