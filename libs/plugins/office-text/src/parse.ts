import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import type { OfficeChunk, OfficeConverterConfig } from 'officeparser';

// Documents come from portals, so from anyone. One that takes too long or
// too much memory ends its own thread, and the hub (its event loop
// renewing the jobs' locks among the rest) goes on.
const HEAP_MB = 512;
const TIMEOUT_MS = 3 * 60_000;

export async function parse(
  data: Uint8Array,
  config: OfficeConverterConfig<'chunks'>,
) {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), {
    workerData: { data, config },
    resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
  });
  try {
    // rejects with the thread's error, its running out of memory too
    const [chunks] = await once(worker, 'message', {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return chunks as OfficeChunk[];
  } finally {
    await worker.terminate();
  }
}
