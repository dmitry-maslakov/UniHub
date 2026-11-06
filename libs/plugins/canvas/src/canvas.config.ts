import { z } from 'zod';
import { Secret, settings } from '@app/plugin-sdk';

// unset when empty, as .env.example leaves it
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const canvasSettings = z
  .object({
    // the school's Canvas: https://canvas.example.edu. Not http, which
    // would send the token in the clear (and Canvas's redirect to https,
    // another origin, would drop it)
    CANVAS_URL: z.url({ protocol: /^https$/ }),
    // a personal access token of the hub's owner, for a Canvas read as
    // shared (README, Plugins); none for one read with users' own tokens
    // (README, Portal accounts)
    CANVAS_TOKEN: blank(z.string().min(1)),
    // Canvas refuses requests that come without one; the default names
    // neither the hub nor whoever runs it
    CANVAS_USER_AGENT: z.string().min(1).default('course-sync'),
    // the developer key the school's Canvas admins made for the hub, its
    // id and its key, for linking users' accounts by Canvas's consent page
    // (README, Portal accounts); both or neither
    CANVAS_OAUTH_CLIENT_ID: blank(z.string().min(1)),
    CANVAS_OAUTH_CLIENT_SECRET: blank(z.string().min(1)),
  })
  .refine(
    (env) => !env.CANVAS_OAUTH_CLIENT_ID === !env.CANVAS_OAUTH_CLIENT_SECRET,
    {
      path: ['CANVAS_OAUTH_CLIENT_SECRET'],
      message:
        'the developer key comes as CANVAS_OAUTH_CLIENT_ID and _SECRET both',
    },
  )
  .transform((env) => ({
    url: env.CANVAS_URL,
    token: env.CANVAS_TOKEN ?? null,
    userAgent: env.CANVAS_USER_AGENT,
    oauth:
      env.CANVAS_OAUTH_CLIENT_ID && env.CANVAS_OAUTH_CLIENT_SECRET
        ? {
            clientId: env.CANVAS_OAUTH_CLIENT_ID,
            clientSecret: new Secret(env.CANVAS_OAUTH_CLIENT_SECRET),
          }
        : null,
  }));

// read once the plugin is on
export const canvasConfig = settings('canvas', canvasSettings);
