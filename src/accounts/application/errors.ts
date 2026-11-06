import { InvalidError, UnavailableError, type PortalId } from '@app/kernel';

// a plugin error's name, as a class names it; nothing else of the error
export const nameOf = (error: unknown) => {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z][\w$]{0,63}$/.test(name) ? name : 'Error';
};

// The portal didn't take the token a user pasted. Names nothing: neither
// the token, nor why, nor whose it might have been.
export class TokenRefusedError extends InvalidError {
  readonly reason = 'TOKEN_REFUSED';

  constructor() {
    super('the portal did not take the token');
  }
}

// The portal couldn't say whose a credential is, for now: away, slow, or
// its connector failing. Try again later. Of what failed only a name is
// kept (the plugin error's, as `failure`), never the error: a user's secret
// was in play, and a plugin's error may hold it (its request's headers, a
// url). What's logged of it is this much.
export class PortalUnavailableError extends UnavailableError {
  readonly reason = 'PORTAL_UNAVAILABLE';

  constructor(
    readonly portal: PortalId,
    readonly failure: string,
  ) {
    super(`portal "${portal}" could not be asked whose the token is`);
  }
}

// The portal didn't link the account: the user said no on its consent
// page, or it refused the code or a refresh token. Names nothing more.
export class OAuthRefusedError extends InvalidError {
  readonly reason = 'OAUTH_REFUSED';

  constructor() {
    super('the portal did not link the account');
  }
}

// No consent of the user's on its way by this state: it ran out, was used
// already, or is another's. One answer for all.
export class ConsentUnknownError extends InvalidError {
  readonly reason = 'CONSENT_UNKNOWN';

  constructor() {
    super('no consent of yours is on its way by this state: start again');
  }
}
