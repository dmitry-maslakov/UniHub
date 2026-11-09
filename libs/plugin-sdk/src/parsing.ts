import { once } from 'node:events';
import type { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Worker } from 'node:worker_threads';

// For processors that parse content. Content comes from portals, so from
// anyone: one file mustn't take the hub's memory, or its thread (the event
// loop renewing the jobs' locks among the rest) for long.

// The content, or null once it goes past maxBytes: reading stops there, so a
// huge file is never held whole.
export async function readUpTo(content: Readable, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of content) {
    size += chunk.length;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

const TERMINATE_WAIT_MS = 5_000;

// The first message of a worker that parses, the worker told to end either
// way. It rejects with the worker's error, its running out of the heap its
// resourceLimits give it too, or past timeoutMs. The plugin makes the worker
// itself: the bundler finds a worker's file only in `new Worker(new URL(...))`.
export async function firstMessage<T>(
  worker: Worker,
  timeoutMs: number,
  terminateWaitMs = TERMINATE_WAIT_MS,
): Promise<T> {
  try {
    const [message] = await once(worker, 'message', {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return message;
  } finally {
    // terminate() may never answer for a thread cut off under load, and the
    // parse is over either way
    await Promise.race([
      worker.terminate(),
      sleep(terminateWaitMs, undefined, { ref: false }),
    ]);
  }
}
