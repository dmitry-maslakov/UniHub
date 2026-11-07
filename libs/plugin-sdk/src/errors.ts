import { InvalidError, NotFoundError } from '@app/kernel';

// Errors a plugin can get back from the hub. `reason` tells them apart in
// code, the same reasons a gRPC connector gets.

// a record refers to a course, item or file the plugin never sent
export class UnknownReferenceError extends NotFoundError {
  readonly reason = 'UNKNOWN_REFERENCE';

  constructor(readonly externalId: string) {
    super(`unknown reference ${externalId}`);
  }
}

// A record the hub won't take: not the shape records.ts describes
// (INVALID_RECORD), or against a rule, like a file naming another course
// than its post's (FILE_COURSE_MISMATCH) or content past the hub's limit
// (CONTENT_TOO_LARGE). Fix the record or skip it.
export class InvalidRecordError extends InvalidError {
  constructor(
    readonly issues: string[],
    readonly reason: Uppercase<string> = 'INVALID_RECORD',
  ) {
    super(`invalid record: ${issues.join('; ')}`);
  }
}

// The portal doesn't take a credential a user linked (expired, revoked, or
// never valid). It says nothing of the credential, nor of whose it was.
export class CredentialRejectedError extends InvalidError {
  readonly reason = 'CREDENTIAL_REJECTED';

  constructor() {
    super('the portal did not take the credential');
  }
}

// The portal's site lets no app use a token a user pastes, whatever it is
// (Canvas hosted by Instructure, whose API policy allows OAuth alone). It
// says nothing of the credential.
export class TokensNotAllowedError extends InvalidError {
  readonly reason = 'TOKENS_NOT_ALLOWED';

  constructor() {
    super("the portal's site takes no pasted tokens");
  }
}
