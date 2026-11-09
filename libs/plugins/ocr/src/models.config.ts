import { z } from 'zod';
import { settings } from '@app/plugin-sdk';

// the llama.cpp (or any OpenAI-compatible) server taking images
const server = z.url({ protocol: /^https?$/ });

export const readerSettings = z
  .object({ READER_URL: server })
  .transform((env) => ({ url: env.READER_URL }));

export const visionSettings = z
  .object({ VISION_URL: server })
  .transform((env) => ({ url: env.VISION_URL }));

// read once the plugin is on
export const readerConfig = settings('reader', readerSettings);
export const visionConfig = settings('vision', visionSettings);
