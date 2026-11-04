// What Canvas answered instead of the data. Messages name the path, not the
// url: a download's query has the file's verifier, a key to the file.
export class CanvasError extends Error {
  constructor(
    readonly status: number,
    url: string,
    // throttled or failing for now: worth another try after a while
    readonly transient = status === 429 || status >= 500,
  ) {
    super(`canvas answered ${status} to ${new URL(url).pathname}`);
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

// what this account doesn't see is null, never an error
export const visible = <T>(read: Promise<T>) =>
  read.catch((error: unknown) => {
    if (error instanceof NotVisibleError) return null;
    throw error;
  });

// What Canvas answered that fails one request, not the run: anything but a
// token it no longer takes, which every request would get.
export const skippable = (error: unknown): error is CanvasError =>
  error instanceof CanvasError && !(error instanceof TokenRejectedError);
