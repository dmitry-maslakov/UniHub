import { z } from 'zod';
import type { Json } from './json.js';

// Text and json as postgres keeps them, checked where they come in. U+0000
// it refuses in text and jsonb. A lone UTF-16 surrogate has no UTF-8 form,
// so it is kept as U+FFFD, and jsonb (JSON too) has no -0. Taken in the form
// they are kept in, values that come in compare equal to the same values
// read back; otherwise a record holding one would change on every resend.

export const StoredText = z
  .string()
  .refine((v) => !v.includes('\u0000'), { message: 'contains a NUL character' })
  .overwrite((v) => v.toWellFormed());

const kept = (value: Json): Json => {
  if (typeof value === 'string') return value.toWellFormed();
  // -0 === 0, so this turns -0 into 0
  if (typeof value === 'number') return value === 0 ? 0 : value;
  if (Array.isArray(value)) return value.map(kept);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.toWellFormed(), kept(v)]),
    );
  return value;
};

export const StoredJson = z
  .json()
  .refine((v) => !JSON.stringify(v).includes('\\u0000'), {
    message: 'contains a NUL character',
  })
  .overwrite(kept);
