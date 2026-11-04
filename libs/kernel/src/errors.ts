// What went wrong, in terms every way in can answer: a missing thing, a
// clash with what's there, or input that can't be taken. Each module's
// errors extend one of these; the edges (HTTP, MCP, gRPC) map the kind, not
// the class.
export type DomainErrorKind = 'not-found' | 'conflict' | 'invalid';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(message: string) {
    super(message);
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

// a value that isn't what its type says ("content hash", "plugin name")
export class InvalidValueError extends InvalidError {
  constructor(
    readonly what: string,
    readonly value: string,
  ) {
    // the value may come from anywhere: quoted, and not the whole of it
    super(`invalid ${what}: ${JSON.stringify(value.slice(0, 80))}`);
  }
}
