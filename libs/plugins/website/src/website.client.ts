import { addAbortSignal, Readable } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import axios, { type AxiosInstance } from 'axios';
import { portalRequests } from '@app/plugin-sdk';

// the run has spent its requests
export class OutOfBudgetError extends Error {
  constructor() {
    super('the run is out of requests');
    this.name = new.target.name;
  }
}

// What didn't come back as an answer: the network, a timeout, a body past
// its limit, a redirect to another site.
export class RequestFailedError extends Error {
  constructor(url: URL, why: string) {
    // the path alone, not a query
    super(`${url.pathname}: ${why}`);
    this.name = new.target.name;
  }
}

export interface Answer<B> {
  status: number;
  // where the answer came from, after any redirects
  url: URL;
  // its Content-Type, lower-cased ('' when it has none)
  type: string;
  body: B;
}

const TIMEOUT_MS = 30_000;
// a text request, its body too, is over by then
const DEADLINE_MS = 60_000;
// a download that sends nothing for this long is cut
const IDLE_MS = 60_000;
const MAX_REDIRECTS = 5;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export interface SiteClientOptions {
  // https://faculty.example.edu: the one origin every request goes to
  origin: string;
  userAgent: string;
  delayMs: number;
  maxRequests: number;
  signal: AbortSignal;
  deadlineMs?: number;
  idleMs?: number;
}

// The site's requests, one at a time, through the sdk's guard on what a
// portal's requests reach: GET only, the User-Agent and nothing else that
// identifies, a pause between any two, a budget every request is taken from
// (a redirect's hop too), and no leaving the site: a redirect to another
// origin is a failure.
export class SiteClient {
  private readonly http: AxiosInstance;
  private spent = 0;
  private lastAt = 0;
  delayMs: number;

  constructor(private readonly options: SiteClientOptions) {
    this.delayMs = options.delayMs;
    this.http = axios.create({
      ...portalRequests,
      headers: { 'User-Agent': options.userAgent },
      signal: options.signal,
      timeout: TIMEOUT_MS,
      // followed here, so each hop is paced, counted and kept on the site
      maxRedirects: 0,
      validateStatus: () => true,
    });
  }

  get requests() {
    return this.spent;
  }

  // a text answer of up to `limit` bytes
  text(url: URL, limit: number) {
    return this.get(url, 'text', limit) as Promise<Answer<string>>;
  }

  // a download as it comes, for the hub to cap as it stores it
  stream(url: URL) {
    return this.get(url, 'stream', -1) as Promise<Answer<Readable>>;
  }

  private async get(
    from: URL,
    responseType: 'text' | 'stream',
    limit: number,
  ): Promise<Answer<string | Readable>> {
    let url = from;
    for (let hops = 0; ; hops++) {
      await this.turn();
      try {
        const res = await this.http.get<string | Readable>(url.href, {
          responseType,
          maxContentLength: limit,
          // the whole of a text answer is bound by it; a download by the
          // watchdog on its data
          ...(responseType === 'text' && {
            signal: AbortSignal.any([
              this.options.signal,
              AbortSignal.timeout(this.options.deadlineMs ?? DEADLINE_MS),
            ]),
          }),
        });
        this.lastAt = Date.now();
        const location = res.headers.location as string | undefined;
        if (!REDIRECTS.has(res.status) || !location) {
          const type = String(res.headers['content-type'] ?? '').toLowerCase();
          const { status, data } = res;
          const body =
            typeof data === 'string' ? data : this.guarded(data, url);
          return { status, url, type, body };
        }
        if (typeof res.data !== 'string') res.data.destroy();
        url = new URL(location, url);
      } catch (error) {
        this.options.signal.throwIfAborted();
        this.lastAt = Date.now();
        throw new RequestFailedError(url, (error as Error).message);
      }
      if (url.origin !== this.options.origin)
        throw new RequestFailedError(from, 'redirected to another site');
      if (hops >= MAX_REDIRECTS)
        throw new RequestFailedError(from, 'too many redirects');
    }
  }

  // A download as it comes, failing as one file when its connection drops or
  // stalls; the run stopping fails it, read or not (axios ends the stream
  // quietly then, as if the file were whole).
  private guarded(data: Readable, url: URL) {
    const idleMs = this.options.idleMs ?? IDLE_MS;
    async function* chunks() {
      let timer: NodeJS.Timeout | undefined;
      const watch = () => {
        clearTimeout(timer);
        timer = globalThis.setTimeout(
          () => data.destroy(new Error(`no data for ${idleMs / 1000} s`)),
          idleMs,
        );
      };
      try {
        watch();
        for await (const chunk of data) {
          clearTimeout(timer);
          yield chunk;
          watch();
        }
      } catch (error) {
        throw new RequestFailedError(url, (error as Error).message);
      } finally {
        clearTimeout(timer);
        data.destroy();
      }
    }
    return addAbortSignal(
      this.options.signal,
      Readable.from(chunks(), { objectMode: false }),
    );
  }

  // wait out the pause since the last request, and take one from the budget
  private async turn() {
    const { signal, maxRequests } = this.options;
    signal.throwIfAborted();
    if (this.spent >= maxRequests) throw new OutOfBudgetError();
    const wait = this.lastAt + this.delayMs - Date.now();
    if (this.lastAt && wait > 0) await setTimeout(wait, undefined, { signal });
    this.spent++;
  }
}
