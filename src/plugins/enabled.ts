import { ConditionalModule } from '@nestjs/config';

// A built-in plugin is on when its name is listed in PLUGINS ("pdf-text,acs").
// The hub runs fine with none.
export function plugin(
  name: string,
  module: Parameters<typeof ConditionalModule.registerWhen>[0],
) {
  return ConditionalModule.registerWhen(module, (env) =>
    (env.PLUGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .includes(name),
  );
}

// built-in plugins, filled in as they appear
export const plugins = [];
