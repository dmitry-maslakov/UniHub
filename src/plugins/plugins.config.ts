import { z } from 'zod';
import { PluginName } from '@app/kernel';
import { list, settings } from '../platform/config/settings.js';

const pluginsSettings = z
  .object({
    // built-in plugins to turn on, by name: "office-text, acs"
    PLUGINS: list.pipe(z.array(PluginName)),
    // this instance starts push connectors (one instance should)
    RUN_CONNECTORS: z.stringbool().default(true),
  })
  .transform((env) => ({
    enabled: env.PLUGINS,
    runConnectors: env.RUN_CONNECTORS,
  }));

export const pluginsConfig = settings('plugins', pluginsSettings);
