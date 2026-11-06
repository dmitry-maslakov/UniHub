import { Command, Query } from '@nestjs/cqrs';
import type { Credential } from '@app/plugin-sdk';
import type { PortalId } from '@app/kernel';

// What plugins ask of users' own accounts, which the accounts module keeps
// and answers (it depends on plugins, not the other way round), and what
// it tells plugins of them.

// whose views a portal's runs are: the shared account's, or the users' own
// accounts' that read now (linked, not expired nor revoked)
export type PortalReaders =
  { shared: true } | { shared: false; accounts: string[] };

export class PortalReadersQuery extends Query<PortalReaders> {
  constructor(readonly portal: PortalId) {
    super();
  }
}

// the credential a user's account was linked by, for a run of it, and
// which seal of it that is (nothing of the credential), to say which one
// the portal refused
export interface AccountCredential {
  credential: Credential;
  seal: string;
}

// null once the account no longer reads
export class AccountCredentialQuery extends Query<AccountCredential | null> {
  constructor(readonly account: string) {
    super();
  }
}

// The portal no longer takes the account's credential of `seal`: it reads
// nothing till it's linked again. One linked again since, by another
// credential, stays as it is.
export class AccountRejectedCommand extends Command<void> {
  constructor(
    readonly account: string,
    readonly seal: string,
  ) {
    super();
  }
}

// Users' accounts of the portal linked, or gone (unlinked, replaced by
// another portal user's, their user deleted): the portal's runs follow,
// and a gone account's connection is forgotten, what it saved and saw.
export class AccountsChangedCommand extends Command<void> {
  constructor(
    readonly portal: PortalId,
    readonly change: { linked?: string[]; gone?: string[] },
  ) {
    super();
  }
}
