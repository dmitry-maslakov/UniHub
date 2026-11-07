import { z } from 'zod';
import { Instance, settings } from '@app/plugin-sdk';

const unset = (v: unknown) => (v === '' ? undefined : v);

export const canvasSettings = z
  .object({
    // The school's Canvas: https://canvas.example.edu, for a Canvas read as
    // shared and for users' accounts linked before each kept its own
    // (README, Canvas). Not http, which would send the token in the clear
    // (and Canvas's redirect to https, another origin, would drop it).
    CANVAS_URL: z.preprocess(unset, Instance.optional()),
    // a personal access token of the hub's owner, for a Canvas read as
    // shared (README, Plugins); none for one read with users' own tokens
    // (README, Portal accounts)
    CANVAS_TOKEN: z.preprocess(unset, z.string().min(1).optional()),
    // Canvas refuses requests that come without one; the default names
    // neither the hub nor whoever runs it
    CANVAS_USER_AGENT: z.string().min(1).default('course-sync'),
  })
  .refine((env) => !env.CANVAS_TOKEN || env.CANVAS_URL, {
    path: ['CANVAS_URL'],
    message: "the Canvas CANVAS_TOKEN is of: the owner's school's",
  })
  .transform((env) => ({
    url: env.CANVAS_URL ?? null,
    token: env.CANVAS_TOKEN ?? null,
    userAgent: env.CANVAS_USER_AGENT,
  }));

// read once the plugin is on
export const canvasConfig = settings('canvas', canvasSettings);
