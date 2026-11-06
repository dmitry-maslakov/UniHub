// The path a message names, never the url: a download's query has the
// file's verifier, a key to the file. Nor a token's hint, the start of the
// token, by which Canvas finds it (/users/self/tokens/{hint}).
const shown = (url: string | URL) =>
  new URL(url).pathname.replace(/(\/users\/[^/]+\/tokens\/)[^/]+/, '$1{hint}');

// What Canvas answered instead of the data, naming the path it showed.
export class CanvasError extends Error {
  constructor(
    readonly status: number,
    url: string,
    // throttled or failing for now: worth another try after a while
    readonly transient = status === 429 || status >= 500,
  ) {
    super(`canvas answered ${status} to ${shown(url)}`);
    this.name = new.target.name;
  }
}

// Refused or not there for this account: a hidden tab, a locked page.
// Never taken for gone, so nothing is removed for it.
export class NotVisibleError extends CanvasError {}

// Canvas no longer takes the token (a 401 that asks to authenticate)
export class TokenRejectedError extends CanvasError {
  override message =
    'canvas token expired or was revoked: make a new one and set CANVAS_TOKEN';
}

// No answer from Canvas after the retries, or not a whole one: the network
// failed, nothing came in time, or what came isn't the JSON asked for. The
// path shown and the reason only, as above: axios's own error holds the
// token.
export class NoAnswerError extends Error {
  constructor(url: string, reason: string) {
    super(`no answer from canvas to ${shown(url)}: ${reason}`);
    this.name = new.target.name;
  }
}

// A download with no answer after the retries, or cut off partway (the
// connection dropped, or a minute went by without a byte read): that
// file's failure, tried again the next run
export class DownloadFailedError extends Error {
  constructor(url: string, reason: string) {
    super(`download of ${shown(url)} failed: ${reason}`);
    this.name = new.target.name;
  }
}

// A url Canvas gave (a file's, a next page) on another origin than the
// school's Canvas: the token isn't sent there, and the run fails saying so
export class OtherOriginError extends Error {
  constructor(to: URL, canvas: string) {
    super(
      `not sending the canvas token to ${to.origin}${shown(to)}: it goes to ${canvas} only`,
    );
    this.name = new.target.name;
  }
}

// A request that would change something on Canvas: the connector only
// reads, and a token a user pasted has no scopes to keep it to that
export class NotAReadError extends Error {
  constructor(method: string, to: URL) {
    super(
      `not sending the canvas token with a ${method.toUpperCase()} to ${shown(to)}: it only reads`,
    );
    this.name = new.target.name;
  }
}

// what this account doesn't see is null, never an error
export const visible = <T>(read: Promise<T>) =>
  read.catch((error: unknown) => {
    if (error instanceof NotVisibleError) return null;
    throw error;
  });

// What fails one request, not the run: anything Canvas answered but a
// token it no longer takes, which every request would get, and a download
// that failed short of an answer.
export const skippable = (
  error: unknown,
): error is CanvasError | DownloadFailedError =>
  (error instanceof CanvasError && !(error instanceof TokenRejectedError)) ||
  error instanceof DownloadFailedError;
