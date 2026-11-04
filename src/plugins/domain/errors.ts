import { ConflictError, NotFoundError, type PortalId } from '@app/kernel';

// two plugins under one name, or two connectors of one portal
export class UsedTwiceError extends ConflictError {
  readonly reason = 'USED_TWICE';

  constructor(
    readonly what: string,
    readonly value: string,
  ) {
    super(`${what} "${value}" is used twice`);
  }
}

// a portal with a connector here and a gRPC token for one elsewhere
export class PortalHasTwoWritersError extends ConflictError {
  readonly reason = 'PORTAL_HAS_TWO_WRITERS';

  constructor(readonly portal: PortalId) {
    super(`portal "${portal}" has a connector and a gRPC token`);
  }
}

// a sync asked of a portal no connector here polls
export class NoPollConnectorError extends NotFoundError {
  readonly reason = 'NO_POLL_CONNECTOR';

  constructor(readonly portal: PortalId) {
    super(`no connector polls portal "${portal}"`);
  }
}
