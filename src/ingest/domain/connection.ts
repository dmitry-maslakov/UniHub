import { z } from 'zod';
import {
  NO_INSTANCE,
  PortalId,
  SHARED_ACCOUNT,
  type Instance,
} from '@app/kernel';

// a key joins portal and account with '__', and job ids can't have ':'
const Account = z
  .string()
  .regex(/^[A-Za-z0-9-]+$/, 'letters, digits and dashes only');

// One account on one portal, the unit a connector syncs: records come in
// as the portal's, of the site the account reads (its instance, none for a
// portal of one site), state is kept per connection. The site is the
// hub's to know: ingest stamps it on every record (toRef), and plugins
// never see it.
export class Connection {
  private constructor(
    readonly portal: PortalId,
    readonly account: string,
    readonly instance: Instance,
  ) {}

  static shared(portal: PortalId, instance = NO_INSTANCE) {
    return new Connection(portal, SHARED_ACCOUNT, instance);
  }

  // from job data or config, checked; its site is found for its run (at)
  static of({ portal, account }: { portal: string; account: string }) {
    return new Connection(
      PortalId.parse(portal),
      Account.parse(account),
      NO_INSTANCE,
    );
  }

  // the same account, reading the portal at this site
  at(instance: Instance) {
    return new Connection(this.portal, this.account, instance);
  }

  // for job ids and schedulers, one per connection: an account reads one
  // site, so the site isn't in it
  get key() {
    return `${this.portal}__${this.account}`;
  }

  // The shared account's records are what everyone sees, so they may come
  // record by record and be removed one by one; a user's own account's
  // "can't see it" isn't "gone for everyone", so it sends what it sees as
  // a whole, by passes (README, Portal accounts).
  get shared() {
    return this.account === SHARED_ACCOUNT;
  }
}
