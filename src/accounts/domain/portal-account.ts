import { randomUUID } from 'node:crypto';
import type { AccountLink, PortalId } from '@app/kernel';

// linked; expired, past its expiry or as a run found it; revoked, the
// portal no longer taking its credential
export type AccountStatus = 'linked' | 'expired' | 'revoked';

// whose a credential is, as the portal's connector found
export interface PortalUser {
  // the portal's own id for its user, nothing more of them
  id: string;
  expiresAt: Date | null;
}

export interface PortalAccountState {
  id: string;
  userId: string;
  portal: PortalId;
  mode: AccountLink;
  portalUser: string;
  status: AccountStatus;
  expiresAt: Date | null;
}

// A user's own account of a portal, one per user and portal, separate from
// every other user's. Its id is what the hub will know it by elsewhere (what
// it sees); its credential is kept apart, sealed (CredentialVault).
export class PortalAccount {
  private constructor(private readonly state: PortalAccountState) {}

  static restore(state: PortalAccountState) {
    return new PortalAccount({ ...state });
  }

  // Linked by a credential of `user`'s. The account the user had of the
  // portal stays when the credential is the same portal user's, linked
  // again; another portal user's is a new account, so nothing carries over.
  static link(
    had: PortalAccount | null,
    of: { userId: string; portal: PortalId; mode: AccountLink },
    user: PortalUser,
  ) {
    const same = had?.state.portalUser === user.id;
    return new PortalAccount({
      id: same ? had.id : randomUUID(),
      ...of,
      portalUser: user.id,
      status: 'linked',
      expiresAt: user.expiresAt,
    });
  }

  get id() {
    return this.state.id;
  }

  get portal() {
    return this.state.portal;
  }

  get expiresAt() {
    return this.state.expiresAt;
  }

  get snapshot(): Readonly<PortalAccountState> {
    return { ...this.state };
  }

  // the portal no longer takes its credential
  revoke() {
    this.state.status = 'revoked';
  }

  // as it stands at `now`: past its expiry it's expired, whatever was last
  // found
  statusAt(now = new Date()): AccountStatus {
    const { status, expiresAt } = this.state;
    return status === 'linked' && expiresAt !== null && expiresAt <= now
      ? 'expired'
      : status;
  }
}

export abstract class PortalAccountRepository {
  abstract find(
    userId: string,
    portal: PortalId,
  ): Promise<PortalAccount | null>;
  // the user's, by portal
  abstract ofUser(userId: string): Promise<PortalAccount[]>;
  // the portal's accounts that are linked and not past their expiry
  abstract linkedOf(portal: PortalId, now: Date): Promise<PortalAccount[]>;
  // the account by its id, with its sealed credential
  abstract withCredential(
    id: string,
  ): Promise<{ account: PortalAccount; sealed: string } | null>;
  // its status as it now is, nothing else of it, while its credential is
  // still `sealed`: one linked again meanwhile keeps its own
  abstract saveStatus(account: PortalAccount, sealed: string): Promise<void>;
  // The account and its sealed credential, at once, in place of any account
  // the user had of the portal and its credential
  abstract save(account: PortalAccount, sealed: string): Promise<void>;
  // the user's account of the portal and its credential, at once: its id,
  // null if there was none
  abstract remove(userId: string, portal: PortalId): Promise<string | null>;
  // all of a user's, and their credentials: which they were
  abstract removeAllOf(
    userId: string,
  ): Promise<{ id: string; portal: PortalId }[]>;
}
