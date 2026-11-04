import { Worker } from 'node:worker_threads';
import type { GeneratorConfig } from 'officeparser';
import { firstMessage } from '@app/plugin-sdk';
import type { Parsed } from './parts.js';

// A document past these ends its own thread, and the hub goes on.
const HEAP_MB = 512;
const TIMEOUT_MS = 3 * 60_000;

export const parse = (data: Uint8Array, config: GeneratorConfig<'chunks'>) =>
  firstMessage<Parsed>(
    new Worker(new URL('./parse.worker.ts', import.meta.url), {
      workerData: { data, config },
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
    }),
    TIMEOUT_MS,
  );
