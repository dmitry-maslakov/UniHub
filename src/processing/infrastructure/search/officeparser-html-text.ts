import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { Injectable } from '@nestjs/common';
import pLimit from 'p-limit';
import { firstMessage } from '@app/plugin-sdk';
import { HtmlText } from '../../application/ports.js';

// past this much it isn't read, it's held in memory twice meanwhile
export const MAX_CHARS = 2_000_000;
// strings past these end their own thread, and the job fails as a
// processor's does
const HEAP_MB = 256;
const TIMEOUT_MS = 30_000;

// at most this many threads at once, however many calls wait
const threads = pLimit(availableParallelism());

// officeparser, as office-text reads an .html file, in a worker thread of
// its own per call with a heap and a time of its own: the strings are a
// portal's, so anyone's
@Injectable()
export class OfficeParserHtmlText extends HtmlText {
  async textsOf(html: readonly string[]) {
    const chars = html.reduce((sum, { length }) => sum + length, 0);
    if (chars > MAX_CHARS)
      throw new Error(`${chars} characters of HTML, past ${MAX_CHARS}`);
    if (!html.length) return [];
    return threads(() =>
      firstMessage<string[]>(
        new Worker(new URL('./html-text.worker.ts', import.meta.url), {
          workerData: { html },
          resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
        }),
        TIMEOUT_MS,
      ),
    );
  }
}
