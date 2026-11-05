import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { setTimeout } from 'node:timers/promises';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import axiosRetry, { exponentialDelay } from 'axios-retry';
import LinkHeader from 'http-link-header';
import {
  CanvasError,
  DownloadCutOffError,
  NotVisibleError,
  TokenRejectedError,
} from './errors.js';

export interface CanvasApiOptions {
  // the school's Canvas, 'https://canvas.example.edu'
  url: string;
  userAgent: string;
  token: string;
  // the run's: requests, retries and waits all stop on it
  signal: AbortSignal;
}

// A throttled or failing request goes again 5 times, after about 1, 2, 4, 8
// and 16 s: exponentialDelay's 2^n times the factor (n from 1), up to a
// fifth more, or as long as Retry-After asks.
export const RETRY = { retries: 5, delayFactor: 500 };
// Each token has a quota that fills up again over time (Canvas's
// throttling docs): with little of it left, each request waits a while
// rather than run into refusals.
export const LOW_QUOTA = 200;
export const PAUSE_MS = 2_000;
// Canvas answers in seconds: a minute without an answer, or without a byte
// in the middle of a download, is a stalled connection. It fails then (a
// request goes again, a download fails its file) rather than at the poll's
// timeout; a long download that keeps coming isn't cut.
const TIMEOUT_MS = 60_000;

// Canvas's REST API, one request at a time.
export class CanvasApi {
  private readonly http: AxiosInstance;

  constructor(private readonly options: CanvasApiOptions) {
    const { url, token, userAgent, signal } = options;
    this.http = axios.create({
      baseURL: url,
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent },
      // left out of a redirect to another origin, a subdomain too: axios
      // does so for this header anyway, the documented option says it
      sensitiveHeaders: ['Authorization'],
      signal,
      timeout: TIMEOUT_MS,
    });
    // before the retries, so each try is paced and its refusal read
    this.http.interceptors.response.use((res) => this.pace(res), readBody);
    axiosRetry(this.http, {
      retries: RETRY.retries,
      retryDelay: (n, error) => exponentialDelay(n, error, RETRY.delayFactor),
      // what isn't Canvas's answer is the network's
      retryCondition: (error) =>
        !axios.isCancel(error) && (refusal(error)?.transient ?? true),
      // each try gets the whole timeout, not what the last ones left
      shouldResetTimeout: true,
    });
    this.http.interceptors.response.use(undefined, (error: unknown) => {
      signal.throwIfAborted();
      throw refusal(error) ?? error;
    });
  }

  async get<T>(path: string): Promise<T> {
    const { data } = await this.http.get<T>(path);
    return data;
  }

  // every page of a listing, following Link rel=next as Canvas gives it
  async list<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    let res = await this.http.get<T[]>(path, { params: { per_page: 100 } });
    for (;;) {
      all.push(...res.data);
      const link = LinkHeader.parse(String(res.headers.link ?? ''));
      const next = link.rel('next')[0]?.uri;
      if (!next) return all;
      res = await this.http.get<T[]>(next);
    }
  }

  // A file's content as it comes. Its url redirects to where Canvas keeps
  // files, on another origin, which never gets the token.
  async download(url: string): Promise<Readable> {
    const { data } = await this.http.get<Readable>(url, {
      responseType: 'stream',
    });
    const content = Readable.from(this.cutOff(data, url), {
      objectMode: false,
    });
    // let go of unread, it lets go of the connection
    content.once('close', () => data.destroy());
    return content;
  }

  // the connection dropping or stalling partway fails that one file
  private async *cutOff(data: Readable, url: string) {
    try {
      yield* data;
    } catch (error) {
      this.options.signal.throwIfAborted();
      throw new DownloadCutOffError(url, error);
    }
  }

  private async pace(res: AxiosResponse) {
    const left = res.headers['x-rate-limit-remaining'];
    if (left != null && Number(left) < LOW_QUOTA)
      await setTimeout(PAUSE_MS, undefined, { signal: this.options.signal });
    return res;
  }
}

// a download's refusal comes as a stream: read, to be told apart below
async function readBody(error: unknown) {
  if (axios.isAxiosError(error) && error.response?.data instanceof Readable)
    error.response.data = await text(error.response.data).catch(() => '');
  throw error;
}

// What Canvas answered instead of the data; nothing for what it didn't
// answer, the network's failure
function refusal(error: unknown) {
  const res = axios.isAxiosError(error) ? error.response : undefined;
  // a body cut off partway comes with the response it was of
  if (!res || res.status < 300) return;
  const { status, headers, data } = res;
  const url = axios.getUri(res.config);
  // a token past its quota gets a 403 too, told apart by the body
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  if (status === 403 && body?.includes('Rate Limit Exceeded'))
    return new CanvasError(403, url, true);
  // a 401 is also "not for you"; only a token Canvas doesn't take is asked
  // to authenticate
  if (status === 401 && headers['www-authenticate'])
    return new TokenRejectedError(401, url);
  if ([401, 403, 404].includes(status)) return new NotVisibleError(status, url);
  return new CanvasError(status, url);
}
