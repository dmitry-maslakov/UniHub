import { z } from 'zod';
import { settings } from './platform/config/settings.js';

// the HTTP server's own settings
export const appSettings = z
  .object({
    PORT: z.coerce.number().int().default(3000),
    // how many proxies in front of the app set X-Forwarded-For (caddy: 1)
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  })
  .transform((env) => ({ port: env.PORT, trustProxy: env.TRUST_PROXY }));

export const appConfig = settings('app', appSettings);
