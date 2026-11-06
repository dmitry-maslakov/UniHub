import { InvalidError, UnavailableError, type PortalId } from '@app/kernel';

// The portal didn't take the token a user pasted. Names nothing: neither
// the token, nor why, nor whose it might have been.
export class TokenRefusedError extends InvalidError {
  readonly reason = 'TOKEN_REFUSED';

  constructor() {
    super('the portal did not take the token');
  }
}

// The portal couldn't say whose a credential is, for now: away, slow, or
// its connector failing. Try again later.
export class PortalUnavailableError extends UnavailableError {
  readonly reason = 'PORTAL_UNAVAILABLE';

  constructor(
    readonly portal: PortalId,
    options?: ErrorOptions,
  ) {
    super(`portal "${portal}" could not be asked whose the token is`, options);
  }
}
