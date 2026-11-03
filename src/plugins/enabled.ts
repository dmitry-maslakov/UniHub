import { ConditionalModule } from '@nestjs/config';
import { parsePlugins } from '../config.js';

// A built-in plugin is on when its name is listed in PLUGINS ("pdf-text,acs").
// The hub runs fine with none.
export function plugin(
  name: string,
  module: Parameters<typeof ConditionalModule.registerWhen>[0],
) {
  return ConditionalModule.registerWhen(module, (env) =>
    parsePlugins(env.PLUGINS).includes(name),
  );
}

// built-in plugins, filled in as they appear
export const plugins = [];
