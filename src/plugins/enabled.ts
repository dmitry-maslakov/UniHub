import { ConditionalModule } from '@nestjs/config';
import { OfficeTextModule } from '@app/plugins/office-text';
import { pluginsSettings } from './plugins.config.js';

// A built-in plugin is on when its name is listed in PLUGINS ("pdf-text,acs").
// The hub runs fine with none. ConditionalModule decides from the
// environment, before any provider exists.
export function plugin(
  name: string,
  module: Parameters<typeof ConditionalModule.registerWhen>[0],
) {
  return ConditionalModule.registerWhen(module, (env) =>
    pluginsSettings.parse(env).enabled.includes(name),
  );
}

// built-in plugins, each turned on by its name
export const plugins = [plugin('office-text', OfficeTextModule)];
