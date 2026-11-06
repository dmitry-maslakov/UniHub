import type { Secret } from '@app/kernel';
import type { PortalAccountState } from './portal-account.js';

// what a sealed credential is bound to, of the account's snapshot
export type SealedFor = Pick<PortalAccountState, 'id' | 'userId' | 'portal'>;

// Keeps credentials sealed at rest. A sealed one is nothing without the
// vault's keys, and opens only for the account it was sealed for, the same
// user's of the same portal, so it can't be moved to another one's row nor
// that row to another user or portal.
export abstract class CredentialVault {
  abstract seal(credential: Secret, account: SealedFor): string;
  // UnreadableCredentialError for one that doesn't open
  abstract open(sealed: string, account: SealedFor): Secret;
}
