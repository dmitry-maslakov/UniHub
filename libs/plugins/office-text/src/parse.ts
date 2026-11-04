import { Worker } from 'node:worker_threads';
import type { GeneratorConfig, SupportedFileType } from 'officeparser';
import { firstMessage } from '@app/plugin-sdk';
import type { Parsed } from './parts.js';

// A document past these ends its own thread, and the hub goes on.
const HEAP_MB = 512;
const TIMEOUT_MS = 3 * 60_000;

// fileType null: officeparser tells the format by its bytes
export const parse = (
  data: Uint8Array,
  fileType: SupportedFileType | null,
  config: GeneratorConfig<'chunks'>,
) =>
  firstMessage<Parsed>(
    new Worker(new URL('./parse.worker.ts', import.meta.url), {
      workerData: { data, fileType, config },
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
    }),
    TIMEOUT_MS,
  );
