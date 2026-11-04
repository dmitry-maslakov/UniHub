import { Worker } from 'node:worker_threads';
import { Injectable } from '@nestjs/common';
import {
  ContentProcessor,
  firstMessage,
  MAX_PART,
  readUpTo,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { KIND } from './formats.js';

// Past these a file is skipped, not cut: no part could say the text goes on.
// A notebook's pictures make it larger than the text it has.
export const MAX_BYTES = 16 * 1024 * 1024;
export const MAX_NOTEBOOK_BYTES = 64 * 1024 * 1024;
// a file past these ends its own thread, and the hub goes on
const HEAP_MB = 512;
const TIMEOUT_MS = 60_000;
// a library's minified code (jquery.min.js, bootstrap.min.css) would turn up
// in every course whose projects have it
const MINIFIED = /\.min\.(m?js|css)$/i;

// Text of source code, plain text, markdown, notebooks and data files: a
// part per section of markdown and notebooks, whole lines up to MAX_PART
// characters of everything else.
@ContentProcessor({
  name: 'plain-text',
  version: 1,
  accepts: Object.keys(KIND),
})
@Injectable()
export class PlainTextProcessor implements ProcessesContent {
  async process(input: ProcessorInput) {
    if (MINIFIED.test(input.name)) return { parts: [] };
    // the hub hands over only what's in accepts, so it's one of these
    const kind = KIND[input.matched];
    const max = kind === 'notebook' ? MAX_NOTEBOOK_BYTES : MAX_BYTES;
    const data = await readUpTo(await input.content(), max);
    if (!data) return { parts: [] };
    const parts = await firstMessage<string[]>(
      new Worker(new URL('./parse.worker.ts', import.meta.url), {
        workerData: { data, kind, max: MAX_PART },
        resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
      }),
      TIMEOUT_MS,
    );
    return { parts };
  }
}
