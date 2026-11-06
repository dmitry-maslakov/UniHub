import { resolve } from 'node:path';
import { z } from 'zod';
import { settings } from '../platform/config/settings.js';

export const webSettings = z
  .object({
    // the web app's build (npm run build in web/), served at /
    WEB_PATH: z.string().default('./web/dist'),
  })
  .transform((env) => ({ root: resolve(env.WEB_PATH) }));

export const webConfig = settings('web', webSettings);
