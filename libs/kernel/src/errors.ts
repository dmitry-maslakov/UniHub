// What went wrong, in terms every way in can answer: a missing thing, a
// clash with what's there, input that can't be taken, a thing it can't be asked of, or something the hub
// needs that is away for now (try again later). Each module's errors extend
// one of these; the edges (HTTP, MCP, gRPC) map the kind, not the class.
export type DomainErrorKind =
  'not-found' | 'conflict' | 'invalid' | 'unprocessable' | 'unavailable';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;
  // which error it is, for a client's code to tell apart where the kind and
  // the message don't ('FILE_COURSE_MISMATCH'): a name that stays when the
  // message is reworded, so UPPER_SNAKE_CASE and never changed
  abstract readonly reason: Uppercase<string>;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export abstract class NotFoundError extends DomainError {
  readonly kind = 'not-found';
}

export abstract class ConflictError extends DomainError {
  readonly kind = 'conflict';
}

export abstract class InvalidError extends DomainError {
  readonly kind = 'invalid';
}

// well-formed and understood, but of a kind the hub can't do that with
export abstract class UnprocessableError extends DomainError {
  readonly kind = 'unprocessable';
}

export abstract class UnavailableError extends DomainError {
  readonly kind = 'unavailable';
}

// a value that isn't what its type says ("content hash", "plugin name")
export class InvalidValueError extends InvalidError {
  readonly reason = 'INVALID_VALUE';

  constructor(
    readonly what: string,
    readonly value: string,
  ) {
    // the value may come from anywhere: quoted, and not the whole of it
    super(`invalid ${what}: ${JSON.stringify(value.slice(0, 80))}`);
  }
}
