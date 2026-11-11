import { Query } from '@nestjs/cqrs';
import type { LinkMode, PortalId } from '@app/kernel';
import type { PortalView, Viewing } from './portal-accounts.js';

// The portals read with users' own accounts, and the user's own accounts in
// them that read now; the public portals, and the user's picks; and the
// portal courses the user hides (PortalAccounts.viewing): what access
// cuts a user's reads of those portals to, and lists as theirs
export class ViewingAccountsQuery extends Query<Viewing> {
  constructor(public readonly userId: string) {
    super();
  }
}

// The portals as the user sees their own links to them, as
// GET /api/me/portals lists them (PortalAccounts.list): what access tells
// an agent of why the user reads no course
export class UserPortalsQuery extends Query<PortalView[]> {
  constructor(public readonly userId: string) {
    super();
  }
}

// The external ids of the portal's courses its connector is asked to sync
// (PortalPicks.wantedOf): a public portal's whole catalog.
export class WantedCoursesQuery extends Query<string[]> {
  constructor(public readonly portal: PortalId) {
    super();
  }
}

// How each of these portals is read and what it is shown by (PortalLinks),
// for admins' lists: a portal PORTAL_LINKS and PORTAL_LABELS don't name is
// shared and goes by its id
export class PortalLinksQuery extends Query<
  ReadonlyMap<PortalId, { mode: LinkMode; label: string }>
> {
  constructor(public readonly portals: readonly PortalId[]) {
    super();
  }
}
