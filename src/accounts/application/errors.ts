import {
  InvalidError,
  NotFoundError,
  UnavailableError,
  type PortalId,
} from '@app/kernel';

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

// No course of that id in the portal's catalog: the portal never sent it,
// or doesn't show it any more
export class NotInCatalogError extends NotFoundError {
  readonly reason = 'NOT_IN_CATALOG';

  constructor(
    readonly portal: PortalId,
    readonly externalId: string,
  ) {
    super(`no course of that id in the catalog of portal "${portal}"`);
  }
}
