import { z } from 'zod';
import { settings } from '@app/plugin-sdk';

export const canvasSettings = z
  .object({
    // the school's Canvas: https://canvas.example.edu. Not http, which
    // would send the token in the clear (and Canvas's redirect to https,
    // another origin, would drop it)
    CANVAS_URL: z.url({ protocol: /^https$/ }),
    // a personal access token of the hub's owner, for a Canvas read as
    // shared (README, Plugins); none for one read with users' own tokens
    // (README, Portal accounts)
    CANVAS_TOKEN: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().min(1).optional(),
    ),
    // Canvas refuses requests that come without one; the default names
    // neither the hub nor whoever runs it
    CANVAS_USER_AGENT: z.string().min(1).default('course-sync'),
  })
  .transform((env) => ({
    url: env.CANVAS_URL,
    token: env.CANVAS_TOKEN ?? null,
    userAgent: env.CANVAS_USER_AGENT,
  }));

// read once the plugin is on
export const canvasConfig = settings('canvas', canvasSettings);
