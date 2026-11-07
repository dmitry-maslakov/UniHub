import { addAbortSignal, Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { setTimeout } from 'node:timers/promises';
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
} from 'axios';
import axiosRetry, { exponentialDelay } from 'axios-retry';
import LinkHeader from 'http-link-header';
import { portalRequests } from '@app/plugin-sdk';
import {
  CanvasError,
  DownloadFailedError,
  NoAnswerError,
  NotAReadError,
  NotVisibleError,
  OtherOriginError,
  TokenRejectedError,
} from './errors.js';

export interface CanvasApiOptions {
  // the school's Canvas, 'https://canvas.example.edu': the one origin the
  // token goes to
  url: string;
  userAgent: string;
  token: string;
  // the run's: requests, retries, waits and downloads all stop on it
  signal: AbortSignal;
  // TIMEOUT_MS unless a spec has it shorter
  timeoutMs?: number;
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
// Canvas answers in seconds. A minute for its answer, redirects included,
// and then a minute without a byte read (the other end stalling, or ours
// not taking any) is a stalled connection: it fails then (a request goes
// again, a download fails its file) rather than at the poll's timeout. A
// long download that keeps coming isn't cut.
const TIMEOUT_MS = 60_000;
// what a request may do with the token: read
const READS = new Set(['get', 'head']);

// Canvas's REST API, one request at a time, through the sdk's guard on
// what a portal's requests reach (portalRequests): whichever address a
// user gave, it and every redirect from it reach public addresses alone.
export class CanvasApi {
  private readonly http: AxiosInstance;

  constructor(private readonly options: CanvasApiOptions) {
    const { url, token, userAgent, signal, timeoutMs = TIMEOUT_MS } = options;
    const canvas = new URL(url).origin;
    this.http = axios.create({
      ...portalRequests,
      baseURL: url,
      // axios leaves Authorization out of a redirect to another origin
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent },
      // a page that isn't JSON (a proxy's, a maintenance one) is no answer
      responseType: 'json',
      transitional: { silentJSONParsing: false },
      signal,
      timeout: timeoutMs,
    });
    // Whatever url Canvas gives, the token goes to the school's Canvas only,
    // and only to read: a token a user pastes has no scopes, so it would let
    // a request do anything its user may. axios has made the method lower
    // case by now.
    this.http.interceptors.request.use((config) => {
      const to = new URL(axios.getUri(config));
      const method = config.method ?? 'get';
      if (!READS.has(method)) throw new NotAReadError(method, to);
      if (to.origin !== canvas) throw new OtherOriginError(to, canvas);
      return config;
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
    // the plugin's errors, none holding axios's config (the token, a
    // download's verifier); one a retry's own chain made goes as it is
    this.http.interceptors.response.use(undefined, (error: unknown) => {
      signal.throwIfAborted();
      if (!axios.isAxiosError(error)) throw error;
      throw refusal(error) ?? unanswered(error);
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
      // an empty body parses to no error, and to no listing either
      if (!Array.isArray(res.data))
        throw new NoAnswerError(axios.getUri(res.config), 'not a list');
      all.push(...res.data);
      const link = LinkHeader.parse(String(res.headers.link ?? ''));
      const next = link.rel('next')[0]?.uri;
      if (!next) return all;
      res = await this.http.get<T[]>(next);
    }
  }

  // A file's content as it comes. Its url redirects to where Canvas keeps
  // files, on another origin, which never gets the token. Its size is the
  // hub's to cap, as it stores it, not an answer's.
  async download(url: string): Promise<Readable> {
    const { data } = await this.http.get<Readable>(url, {
      responseType: 'stream',
      maxContentLength: -1,
    });
    const content = Readable.from(chunks(data, url), { objectMode: false });
    // let go of unread, it lets go of the connection
    content.once('close', () => data.destroy());
    // The run stopping fails it, read or not: axios ends the stream quietly
    // then, as if the file were whole.
    return addAbortSignal(this.options.signal, content);
  }

  private async pace(res: AxiosResponse) {
    const left = res.headers['x-rate-limit-remaining'];
    if (left != null && Number(left) < LOW_QUOTA)
      await setTimeout(PAUSE_MS, undefined, { signal: this.options.signal });
    return res;
  }
}

// the connection dropping or stalling partway fails that one file
async function* chunks(data: Readable, url: string) {
  try {
    yield* data;
  } catch (error) {
    throw new DownloadFailedError(url, (error as Error).message);
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
function refusal(error: AxiosError) {
  const res = error.response;
  // a body cut off partway, or not JSON, comes with the response it was of
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

// no answer after the retries: a download's fails that file, any other the run
function unanswered(error: AxiosError) {
  const url = axios.getUri(error.config);
  return error.config?.responseType === 'stream'
    ? new DownloadFailedError(url, error.message)
    : new NoAnswerError(url, error.message);
}
