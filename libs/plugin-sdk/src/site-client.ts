import { addAbortSignal, Readable } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import axios, { type AxiosInstance, type RawAxiosResponseHeaders } from 'axios';
import robots from 'robots-parser';
import { portalRequests } from './http.js';

// the package's types say `default`, its code exports the function itself
const robotsParser = robots as unknown as typeof robots.default;

// the run has spent its requests
export class OutOfBudgetError extends Error {
  constructor() {
    super('the run is out of requests');
    this.name = new.target.name;
  }
}

// What didn't come back as an answer: the network, a timeout, a body past
// its limit, an address or a redirect on another site.
export class RequestFailedError extends Error {
  constructor(url: URL, why: string) {
    // the path alone, not a query
    super(`${url.pathname}: ${why}`);
    this.name = new.target.name;
  }
}

// robots.txt couldn't be read: the site answered with another status
// (`status`), or not at all (null). A site that can't say what it allows
// is left alone.
export class RobotsUnreadableError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
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
const ROBOTS_LIMIT = 1024 * 1024;
const MAX_CRAWL_DELAY_MS = 30_000;

// what the site says of an address without its body
export interface Head extends Answer<null> {
  // its Content-Length and Last-Modified, null where it says none
  size: number | null;
  modified: Date | null;
}

export interface SiteRobots {
  // false for a page robots.txt disallows to the client's agent
  allowed(url: URL): boolean;
}

export interface SiteClientOptions {
  // https://faculty.example.edu: the one origin every request goes to
  origin: string;
  // names neither the hub nor whoever runs it
  userAgent: string;
  delayMs: number;
  maxRequests: number;
  signal: AbortSignal;
  deadlineMs?: number;
  idleMs?: number;
}

// For a plugin that reads a public website, with no account: the site's
// requests, each awaited before the next, through the sdk's guard on what a
// portal's requests reach: GET and HEAD only, the User-Agent and nothing
// else that
// identifies, a pause between any two, a budget every request is taken from
// (a redirect's hop too), and no leaving the site: an address or a
// redirect on another origin is a failure.
export class SiteClient {
  private readonly http: AxiosInstance;
  private readonly origin: string;
  private spent = 0;
  private lastAt = 0;
  private delayMs: number;

  constructor(private readonly options: SiteClientOptions) {
    this.origin = new URL(options.origin).origin;
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

  // the address's status, type, size and date, its body left
  async head(url: URL): Promise<Head> {
    const { headers, ...answer } = await this.get(url, 'head', 0);
    const size = Number(headers['content-length'] ?? NaN);
    const modified = new Date(String(headers['last-modified'] ?? NaN));
    return {
      ...answer,
      body: null,
      size: Number.isSafeInteger(size) && size >= 0 ? size : null,
      modified: Number.isNaN(modified.getTime()) ? null : modified,
    };
  }

  // The site's robots.txt for the client's agent, asked for once: none (a
  // 404) allows everything, and a Crawl-delay longer than the client's pause
  // replaces it from then on, up to 30 s. Any other answer, or none, is a
  // RobotsUnreadableError.
  async robots(): Promise<SiteRobots> {
    const url = new URL('/robots.txt', this.origin);
    const answer = await this.text(url, ROBOTS_LIMIT).catch((e) => {
      if (e instanceof RequestFailedError)
        throw new RobotsUnreadableError(e.message, null);
      throw e;
    });
    const ok = answer.status >= 200 && answer.status < 300;
    if (answer.status !== 404 && !ok)
      throw new RobotsUnreadableError(
        `robots.txt: the site answered ${answer.status}`,
        answer.status,
      );
    const parsed = robotsParser(url.href, ok ? answer.body : '');
    const { userAgent } = this.options;
    const wait = (parsed.getCrawlDelay(userAgent) ?? 0) * 1000;
    if (wait > this.delayMs) this.delayMs = Math.min(wait, MAX_CRAWL_DELAY_MS);
    return {
      allowed: (page) => parsed.isAllowed(page.href, userAgent) !== false,
    };
  }

  private async get(
    from: URL,
    kind: 'text' | 'stream' | 'head',
    limit: number,
  ): Promise<Answer<string | Readable> & { headers: RawAxiosResponseHeaders }> {
    if (from.origin !== this.origin)
      throw new RequestFailedError(from, 'on another site');
    let url = from;
    for (let hops = 0; ; hops++) {
      await this.turn();
      try {
        const res = await this.http.request<string | Readable>({
          url: url.href,
          method: kind === 'head' ? 'HEAD' : 'GET',
          responseType: kind === 'stream' ? 'stream' : 'text',
          maxContentLength: limit,
          // the whole of a text answer is bound by it; a download by the
          // watchdog on its data
          ...(kind !== 'stream' && {
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
          const headers = res.headers as RawAxiosResponseHeaders;
          return { status, url, type, body, headers };
        }
        if (typeof res.data !== 'string') res.data.destroy();
        url = new URL(location, url);
      } catch (error) {
        this.options.signal.throwIfAborted();
        this.lastAt = Date.now();
        throw new RequestFailedError(url, (error as Error).message);
      }
      if (url.origin !== this.origin)
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
