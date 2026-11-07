import type { Instance, PortalId } from '@app/kernel';

// Records kept before their portal's connector told its sites apart: they
// have none ('').
export abstract class Instances {
  // the portal's records with no site are this one's: how many were
  abstract adopt(portal: PortalId, instance: Instance): Promise<number>;
}
