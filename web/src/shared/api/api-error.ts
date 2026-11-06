// What a REST call the hub refused throws: its status, and its body as
// `error`, which is the shape of Better Auth's own failures (see authError),
// so one reading of both tells SESSION_NOT_FRESH or a 429 apart
export class ApiError extends Error {
  status: number;
  error: unknown;

  constructor(status: number, error: unknown) {
    super(`The hub answered ${status}`);
    this.status = status;
    this.error = error;
  }
}
