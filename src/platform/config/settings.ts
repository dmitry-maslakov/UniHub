import { z } from 'zod';

// the sdk's, so the hub's modules and the plugins read theirs one way
export { settings } from '@app/plugin-sdk';

// "a, b" → ['a', 'b']
export const parseList = (value = '') =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// a comma-separated list
export const list = z.string().default('').transform(parseList);

// unset when empty, as .env.example leaves it
export const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
