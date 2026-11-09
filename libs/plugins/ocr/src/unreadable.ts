// A file that can't be read, which is the file's fault: too large, corrupt,
// refused by its reader, too heavy for a thread. It's stored as nothing read
// and logged; any other error fails the job, which is tried again.
export class Unreadable extends Error {}

// what a worker thread that ran out of heap or time says of the file
const WORKER_LIMITS = [
  'ERR_WORKER_OUT_OF_MEMORY',
  'AbortError',
  'TimeoutError',
];

// The result of a worker thread: its `{ refused: true }`, running out of
// memory or time are the file's fault; anything else (it can't start, it
// isn't packaged) is ours and passes.
export async function fromWorker<T extends object>(message: Promise<T>) {
  let result: T;
  try {
    result = await message;
  } catch (error) {
    if (
      error instanceof Error &&
      WORKER_LIMITS.some(
        (id) => id === (error as { code?: string }).code || id === error.name,
      )
    )
      throw new Unreadable(error.message, { cause: error });
    throw error;
  }
  if ('refused' in result) throw new Unreadable('it can not be opened');
  return result;
}

// Runs `read` on a file's bytes: whatever it throws is the file's fault.
export async function ofTheFile<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    throw error instanceof Unreadable
      ? error
      : new Unreadable(error instanceof Error ? error.message : String(error), {
          cause: error,
        });
  }
}
