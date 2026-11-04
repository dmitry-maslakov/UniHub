import { registerAs } from '@nestjs/config';
import { z } from 'zod';

// A module's settings, a plugin's or the hub's: read from the environment
// once, checked and shaped there, injected as ConfigType<typeof …>. A bad
// one stops the app at startup, by its name. Here, as plugins can't import
// the hub.
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
