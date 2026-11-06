import type { Secret } from '@app/kernel';

// Keeps credentials sealed at rest. A sealed one is nothing without the
// vault's keys, and opens only for the account it was sealed for, so it
// can't be moved to another one's row.
export abstract class CredentialVault {
  abstract seal(credential: Secret, accountId: string): string;
  // UnreadableCredentialError for one that doesn't open
  abstract open(sealed: string, accountId: string): Secret;
}
