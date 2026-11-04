import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { setTimeout } from 'node:timers/promises';
import LinkHeader from 'http-link-header';
import pRetry from 'p-retry';
import { CanvasError, NotVisibleError, TokenRejectedError } from './errors.js';

export interface CanvasApiOptions {
  // the school's Canvas, 'https://canvas.example.edu'
  url: string;
  userAgent: string;
  token: string;
  // the run's: requests, retries and waits all stop on it
  signal: AbortSignal;
}

// a throttled or failing request goes again after 1, 2, 4, 8 and 16 s
export const RETRY = { retries: 5, minTimeout: 1_000, factor: 2 };
// Each token has a quota that fills up again over time (Canvas's
// throttling docs): with little of it left, each request waits a while
// rather than run into refusals.
export const LOW_QUOTA = 200;
export const PAUSE_MS = 2_000;

// Canvas's REST API, one request at a time.
export class CanvasApi {
  constructor(private readonly options: CanvasApiOptions) {}

  async get<T>(path: string): Promise<T> {
    const res = await this.request(new URL(path, this.options.url).href);
    return (await res.json()) as T;
  }

  // every page of a listing, following Link rel=next as Canvas gives it
  async list<T>(path: string): Promise<T[]> {
    const first = new URL(path, this.options.url);
    first.searchParams.set('per_page', '100');
    const all: T[] = [];
    let next: string | undefined = first.href;
    while (next) {
      const res = await this.request(next);
      all.push(...((await res.json()) as T[]));
      const link = LinkHeader.parse(res.headers.get('link') ?? '');
      next = link.rel('next')[0]?.uri;
    }
    return all;
  }

  // A file's content. Its url redirects to where Canvas keeps files, on
  // another origin, so fetch leaves the token behind.
  async download(url: string) {
    const res = await this.request(url);
    // fetch's stream, typed as the DOM's
    return Readable.fromWeb(res.body as ReadableStream<Uint8Array>);
  }

  private request(url: string) {
    const { token, userAgent, signal } = this.options;
    return pRetry(
      async () => {
        const res = await fetch(url, {
          headers: {
            authorization: `Bearer ${token}`,
            'user-agent': userAgent,
          },
          signal,
        });
        if (!res.ok) throw await refusal(res, url);
        await this.pace(res);
        return res;
      },
      {
        ...RETRY,
        signal,
        // what isn't Canvas's answer is the network's
        shouldRetry: ({ error }) =>
          !(error instanceof CanvasError) || error.transient,
      },
    );
  }

  private async pace(res: Response) {
    const left = res.headers.get('x-rate-limit-remaining');
    if (left !== null && Number(left) < LOW_QUOTA)
      await setTimeout(PAUSE_MS, undefined, { signal: this.options.signal });
  }
}

async function refusal(res: Response, url: string) {
  // a token past its quota gets a 403 too, told apart by the body
  const body = await res.text();
  if (res.status === 403 && body.includes('Rate Limit Exceeded'))
    return new CanvasError(403, url, true);
  // a 401 is also "not for you"; only a token Canvas doesn't take is asked
  // to authenticate
  if (res.status === 401 && res.headers.has('www-authenticate'))
    return new TokenRejectedError(401, url);
  if ([401, 403, 404].includes(res.status))
    return new NotVisibleError(res.status, url);
  return new CanvasError(res.status, url);
}
