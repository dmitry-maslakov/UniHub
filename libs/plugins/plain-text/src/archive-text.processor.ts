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
import type { Limits } from './archive.js';
import { ARCHIVE } from './formats.js';

// past this an archive is skipped, not read in part
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const LIMITS: Limits = {
  entries: 10_000,
  total: 64 * 1024 * 1024,
  unpacked: 256 * 1024 * 1024,
  // text packs to a tenth of itself or so, a zip bomb to a thousandth
  ratio: 100,
};
// an archive past these ends its own thread, and the hub goes on
const HEAP_MB = 512;
const TIMEOUT_MS = 3 * 60_000;

// The text files in zip, tar and gzip archives, as plain-text reads them: a
// file's parts after the one before's, each part starting with the file's
// path in the archive.
@ContentProcessor({
  name: 'archive-text',
  version: 1,
  accepts: Object.keys(ARCHIVE),
})
@Injectable()
export class ArchiveTextProcessor implements ProcessesContent {
  async process(input: ProcessorInput) {
    const data = await readUpTo(await input.content(), MAX_ARCHIVE_BYTES);
    if (!data) return { parts: [] };
    const parts = await firstMessage<string[]>(
      new Worker(new URL('./archive.worker.ts', import.meta.url), {
        workerData: {
          data,
          // the hub hands over only what's in accepts, so it's one of these
          format: ARCHIVE[input.matched],
          name: input.name,
          limits: LIMITS,
          max: MAX_PART,
        },
        resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
      }),
      TIMEOUT_MS,
    );
    return { parts };
  }
}
