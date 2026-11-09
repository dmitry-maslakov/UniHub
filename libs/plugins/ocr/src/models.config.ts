import { z } from 'zod';
import { settings } from '@app/plugin-sdk';

// the llama.cpp (or any OpenAI-compatible) server taking images
// with no path: the calls add /v1/... themselves
const server = z
  .url({ protocol: /^https?$/ })
  .refine(
    (url) => !URL.canParse(url) || ['', '/'].includes(new URL(url).pathname),
    'no path, as http://host:8081',
  );

export const readerSettings = z
  .object({ READER_URL: server })
  .transform((env) => ({ url: env.READER_URL }));

export const visionSettings = z
  .object({ VISION_URL: server })
  .transform((env) => ({ url: env.VISION_URL }));

// read once the plugin is on
export const readerConfig = settings('reader', readerSettings);
export const visionConfig = settings('vision', visionSettings);
