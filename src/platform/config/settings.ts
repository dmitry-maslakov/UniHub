import { registerAs } from '@nestjs/config';
import { z } from 'zod';

// "a, b" → ['a', 'b']
export const parseList = (value = '') =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// a comma-separated list
export const list = z.string().default('').transform(parseList);

// A module's settings: read from the environment once, checked and shaped
// there, injected as ConfigType<typeof …>. A bad one stops the app at
// startup, by its name.
export const settings = <S extends z.ZodType<object>>(
  namespace: string,
  schema: S,
) =>
  registerAs(namespace, (): z.output<S> => {
    const result = schema.safeParse(process.env);
    if (!result.success)
      throw new Error(
        `invalid ${namespace} settings\n${z.prettifyError(result.error)}`,
      );
    return result.data;
  });
