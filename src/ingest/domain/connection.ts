import { z } from 'zod';
import { PortalId, SHARED_ACCOUNT } from '@app/kernel';

// a key joins portal and account with '__', and job ids can't have ':'
const Account = z
  .string()
  .regex(/^[A-Za-z0-9-]+$/, 'letters, digits and dashes only');

// One account on one portal, the unit a connector syncs: records come in
// as the portal's, state is kept per connection.
export class Connection {
  private constructor(
    readonly portal: PortalId,
    readonly account: string,
  ) {}

  static shared(portal: PortalId) {
    return new Connection(portal, SHARED_ACCOUNT);
  }

  // from job data or config, checked
  static of({ portal, account }: { portal: string; account: string }) {
    return new Connection(PortalId.parse(portal), Account.parse(account));
  }

  // for job ids and schedulers, one per connection
  get key() {
    return `${this.portal}__${this.account}`;
  }

  // With per-user accounts "this user can't see it" isn't "gone for
  // everyone": only what everyone sees may be removed.
  get mayRemoveRecords() {
    return this.account === SHARED_ACCOUNT;
  }
}
