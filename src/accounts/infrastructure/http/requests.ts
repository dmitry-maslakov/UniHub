import { z } from 'zod';
import { Secret } from '@app/kernel';

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

// What the portal's consent page sends the user back with, as it is: the
// code and the state, or an error; checked by the OAuth client
export const consentAnswer = z
  .record(z.string(), z.string().max(4096))
  .transform((query) => new URLSearchParams(query));
