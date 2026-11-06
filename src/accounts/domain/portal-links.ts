import type { AccountLink, LinkMode, PortalId } from '@app/kernel';
import { NotLinkableError, UnsupportedLinkError } from './errors.js';

// how a portal's accounts are linked, and who may link one
export interface PortalLink {
  mode: LinkMode;
  // only admins may link one (canvas=token/admins)
  adminsOnly: boolean;
}

const SHARED: PortalLink = { mode: 'shared', adminsOnly: false };

// Each portal's link mode, as PORTAL_LINKS sets it. A portal it doesn't
// name is shared, as every portal was before users had accounts.
export class PortalLinks {
  constructor(private readonly byPortal: ReadonlyMap<PortalId, PortalLink>) {}

  of(portal: PortalId): PortalLink {
    return this.byPortal.get(portal) ?? SHARED;
  }

  // the portals a user may link an account of, an admin or not, in order
  openTo(admin: boolean): PortalId[] {
    return [...this.byPortal]
      .filter(
        ([, link]) => link.mode !== 'shared' && (admin || !link.adminsOnly),
      )
      .map(([portal]) => portal)
      .sort();
  }

  // NotLinkableError unless the user may link an account of the portal by
  // `mode`: it isn't the portal's, or only admins may and they aren't one.
  // The same answer either way, so it tells no one more than that.
  check(portal: PortalId, mode: AccountLink, admin: boolean) {
    const link = this.of(portal);
    if (link.mode !== mode || (link.adminsOnly && !admin))
      throw new NotLinkableError(portal, mode);
  }

  // UnsupportedLinkError for a mode the portal's connector doesn't take,
  // as `takes` says: checked at startup
  checkAgainst(takes: (portal: PortalId, mode: AccountLink) => boolean) {
    for (const [portal, { mode }] of this.byPortal)
      if (mode !== 'shared' && !takes(portal, mode))
        throw new UnsupportedLinkError(portal, mode);
  }
}
