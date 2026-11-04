import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export const canvasSettings = z
  .object({
    // the school's Canvas: https://canvas.example.edu
    CANVAS_URL: z.url({ protocol: /^https?$/ }),
    // a personal access token of the hub's owner (README, Plugins)
    CANVAS_TOKEN: z.string().min(1),
    // Canvas refuses requests that come without one
    CANVAS_USER_AGENT: z.string().min(1).default('UniHub canvas connector'),
  })
  .transform((env) => ({
    url: env.CANVAS_URL,
    token: env.CANVAS_TOKEN,
    userAgent: env.CANVAS_USER_AGENT,
  }));

// read once the plugin is on; a bad setting stops the app, by its name
export const canvasConfig = registerAs('canvas', () => {
  const result = canvasSettings.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `invalid canvas settings\n${z.prettifyError(result.error)}`,
    );
  return result.data;
});
