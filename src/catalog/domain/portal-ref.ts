import type { PortalId } from '@app/kernel';

// a record as its portal knows it: the hub's ids are ours, these are theirs
export interface PortalRef {
  readonly portal: PortalId;
  readonly externalId: string;
}
