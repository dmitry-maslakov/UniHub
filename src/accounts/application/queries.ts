import { Query } from '@nestjs/cqrs';
import type { LinkMode, PortalId } from '@app/kernel';
import type { Viewing } from './portal-accounts.js';

// The portals read with users' own accounts, and the user's own accounts in
// them that read now; the public portals, and the user's picks
// (PortalAccounts.viewing): what access cuts a user's reads of those
// portals to
export class ViewingAccountsQuery extends Query<Viewing> {
  constructor(public readonly userId: string) {
    super();
  }
}

// The external ids of the portal's courses its connector is asked to sync
// (PortalPicks.wantedOf): what its users picked, or did within the grace.
// Nothing of who, or how many.
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
