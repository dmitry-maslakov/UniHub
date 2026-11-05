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
import { KIND, maxBytes, MINIFIED } from './formats.js';

// a file past these ends its own thread, and the hub goes on
const HEAP_MB = 512;
const TIMEOUT_MS = 60_000;

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
    const data = await readUpTo(await input.content(), maxBytes(kind));
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
