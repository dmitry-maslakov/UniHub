import type { Instance, PortalId } from '@app/kernel';

// a portal at one of its sites (its instance, '' for a portal of one): what
// every record a connection sends shares
export interface PortalSite {
  readonly portal: PortalId;
  readonly instance: Instance;
}

// a record as its portal knows it: the hub's ids are ours, these are theirs
export interface PortalRef extends PortalSite {
  readonly externalId: string;
}
