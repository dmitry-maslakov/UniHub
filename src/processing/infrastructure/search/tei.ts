import {
  AWAY_STATUSES,
  isConnectionError,
} from '../../../platform/errors/is-connection-error.js';

// A call to a text embeddings inference server (an embedder, a reranker),
// its answer's JSON. The server down, gone mid-request, not found or too busy
// is an `Away`, worth waiting out; anything else, a timeout too, is the
// call's own failure.
export async function callTei(
  url: URL,
  init: RequestInit,
  Away: new (message: string, options?: ErrorOptions) => Error,
): Promise<unknown> {
  const res = await fetch(url, init).catch((err: unknown) => {
    // fetch's TypeError says only 'fetch failed', its cause what kept it
    const cause = (err as Error | undefined)?.cause as
      NodeJS.ErrnoException | undefined;
    if (!isConnectionError(cause)) throw err;
    throw new Away(`${url}: ${cause?.code ?? cause?.message}`, {
      cause: err,
    });
  });
  if (AWAY_STATUSES.has(res.status))
    throw new Away(`${url} answered ${res.status}`);
  if (!res.ok)
    throw new Error(`${url} answered ${res.status}: ${await res.text()}`);
  return res.json();
}
