import type { AccountLink, LinkMode, PortalId } from '@app/kernel';
import {
  NotLinkableError,
  NotPickableError,
  UnsupportedLinkError,
} from './errors.js';

// how a portal's accounts are linked, and who may link one
export interface PortalLink {
  mode: LinkMode;
  // only admins may link one (canvas=token/admins)
  adminsOnly: boolean;
}

const SHARED: PortalLink = { mode: 'shared', adminsOnly: false };

// Each portal's link mode, as PORTAL_LINKS sets it, and the name it's shown
// by (PORTAL_LABELS). A portal it doesn't name is shared, as every portal
// was before users had accounts, and goes by its id.
export class PortalLinks {
  constructor(
    private readonly byPortal: ReadonlyMap<PortalId, PortalLink>,
    private readonly labels: ReadonlyMap<PortalId, string> = new Map(),
  ) {}

  of(portal: PortalId): PortalLink {
    return this.byPortal.get(portal) ?? SHARED;
  }

  label(portal: PortalId): string {
    return this.labels.get(portal) ?? portal;
  }

  // the portals a user may link an account of or pick courses from, an
  // admin or not, in order: every one not shared, those for admins to
  // admins alone
  openTo(admin: boolean): PortalId[] {
    return [...this.byPortal]
      .filter(
        ([, link]) => link.mode !== 'shared' && (admin || !link.adminsOnly),
      )
      .map(([portal]) => portal)
      .sort();
  }

  // the portals read with users' own accounts, in order: those linked by
  // token
  readWithAccounts(): PortalId[] {
    return this.inMode('token');
  }

  // the public portals, in order: read through their one account, each
  // user the courses they picked of its catalog
  readByPicks(): PortalId[] {
    return this.inMode('public');
  }

  // NotLinkableError unless the user may link an account of the portal by
  // `mode`: it isn't the portal's, or only admins may and they aren't one.
  // The same answer either way, so it tells no one more than that.
  check(portal: PortalId, mode: AccountLink, admin: boolean) {
    const link = this.of(portal);
    if (link.mode !== mode || (link.adminsOnly && !admin))
      throw new NotLinkableError(portal, mode);
  }

  // NotPickableError unless the portal is public, a catalog to pick from
  checkPicking(portal: PortalId) {
    if (this.of(portal).mode !== 'public') throw new NotPickableError(portal);
  }

  // UnsupportedLinkError for a mode the portal's connector doesn't take,
  // as `takes` says: checked at startup
  checkAgainst(
    takes: (portal: PortalId, mode: Exclude<LinkMode, 'shared'>) => boolean,
  ) {
    for (const [portal, { mode }] of this.byPortal)
      if (mode !== 'shared' && !takes(portal, mode))
        throw new UnsupportedLinkError(portal, mode);
  }

  private inMode(mode: LinkMode) {
    return [...this.byPortal]
      .filter(([, link]) => link.mode === mode)
      .map(([portal]) => portal)
      .sort();
  }
}
