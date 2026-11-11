import { InvalidError, NotFoundError, type PortalId } from '@app/kernel';

// No account of the portal is linked by this mode, or not by this user (one
// only admins may link): one answer for both
export class NotLinkableError extends NotFoundError {
  readonly reason = 'NOT_LINKABLE';

  constructor(
    readonly portal: PortalId,
    readonly mode: string,
  ) {
    super(`no account of portal "${portal}" to link by ${mode}`);
  }
}

// The portal has no catalog to pick courses from: it isn't public
export class NotPickableError extends NotFoundError {
  readonly reason = 'NOT_PICKABLE';

  constructor(readonly portal: PortalId) {
    super(`no catalog of portal "${portal}" to pick from`);
  }
}

// PORTAL_LINKS names a mode the portal's connector doesn't take (or there's
// no connector of the portal here): the app doesn't start. Public takes a
// connector over gRPC, or a built-in one that sends its whole catalog
export class UnsupportedLinkError extends InvalidError {
  readonly reason = 'UNSUPPORTED_LINK';

  constructor(
    readonly portal: PortalId,
    readonly mode: string,
  ) {
    super(
      mode === 'public'
        ? `PORTAL_LINKS: "${portal}" has no connector over gRPC to read it as public`
        : `PORTAL_LINKS: no connector here links accounts of "${portal}" by ${mode}`,
    );
  }
}

// A sealed credential that doesn't open: sealed under a key no longer
// listed, for another account, or changed since. Names none of it.
export class UnreadableCredentialError extends InvalidError {
  readonly reason = 'UNREADABLE_CREDENTIAL';

  constructor() {
    super('a sealed credential does not open');
  }
}
