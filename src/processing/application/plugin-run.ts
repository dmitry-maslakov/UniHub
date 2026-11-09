import type { Readable } from 'node:stream';
import type { ContentHash } from '@app/kernel';
import type { BlobStore } from '../../storage/contracts.js';
import type { FileFact } from './ports.js';

// A plugin's run on some content: a fresh stream on every call, all of them
// closed once the run is over.
export async function withStreams<T>(
  blobs: BlobStore,
  hash: ContentHash,
  run: (content: () => Promise<Readable>) => Promise<T>,
) {
  const opened: Readable[] = [];
  let done = false;
  try {
    return await run(async () => {
      const stream = await blobs.get(hash);
      // asked for after the run ended: nobody would close it
      if (done) {
        stream.destroy();
        throw new Error('content asked for after the run');
      }
      opened.push(stream);
      return stream;
    });
  } finally {
    done = true;
    for (const stream of opened) stream.destroy();
  }
}

// the first name a plugin takes, with the accepts entry it matched
export function takenName<N extends FileFact>(
  names: readonly N[],
  match: (name: FileFact) => string | null,
) {
  for (const name of names) {
    const matched = match(name);
    if (matched !== null) return { ...name, matched };
  }
  return null;
}

// What `run` makes, or the signal's reason once it aborts: a run that ignores
// the signal doesn't hold the job up past it.
export function until<T>(signal: AbortSignal | undefined, run: Promise<T>) {
  if (!signal) return run;
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
  });
  return Promise.race([run, aborted]);
}
