import type { Instance, PortalId } from '@app/kernel';

// What adopting a portal's records came to: how many are the site's now,
// and the ids of any kept twice, with no site and with this one, each sent
// by runs, which are left as they are
export interface Adopted {
  records: number;
  twice: string[];
}

// Records kept before their portal's connector told its sites apart: they
// have none (''). One of the site kept beside one of them (an app from
// before, an admin's link before the worker came) is the same record: the
// one runs sent stays, and what named the other names it.
export abstract class Instances {
  abstract adopt(portal: PortalId, instance: Instance): Promise<Adopted>;
}
