import { ConditionalModule } from '@nestjs/config';
import { ArchivesModule } from '@app/plugins/archives';
import { CanvasModule } from '@app/plugins/canvas';
import { OcrModule, ReaderModule, VisionModule } from '@app/plugins/ocr';
import { OfficeTextModule } from '@app/plugins/office-text';
import { PlainTextModule } from '@app/plugins/plain-text';
import { pluginsConfig } from './plugins.config.js';

// A built-in plugin is on when its name is listed in PLUGINS ("office-text,moodle").
// The hub runs fine with none. ConditionalModule decides from the
// environment, before any provider exists.
export function plugin(
  name: string,
  module: Parameters<typeof ConditionalModule.registerWhen>[0],
) {
  return ConditionalModule.registerWhen(module, () =>
    pluginsConfig().enabled.some((enabled) => enabled === name),
  );
}

// built-in plugins, each turned on by its name
export const plugins = [
  plugin('archives', ArchivesModule),
  plugin('canvas', CanvasModule),
  plugin('ocr', OcrModule),
  plugin('office-text', OfficeTextModule),
  plugin('plain-text', PlainTextModule),
  plugin('reader', ReaderModule),
  plugin('vision', VisionModule),
];
