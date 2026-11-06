import type { Secret } from '@app/kernel';

// Users' own accounts of a portal, beyond the shared one the plugin's
// settings give (README, Portal accounts): a connector names the
// AccountLinks it takes in its decorator (the hub refuses any other at
// startup), and linking one asks it whose a credential is.

// what a user gave the hub to act as them on the portal
export interface Credential {
  kind: 'token';
  token: Secret;
}

// whose a credential is, as the portal knows them
export interface PortalUser {
  // the portal's own id for the user, never a name or an email
  id: string;
  // when the credential stops working; null if it doesn't, or the portal
  // won't say
  expiresAt: Date | null;
}

// What a connector that takes links does when a user links an account.
export interface IdentifiesAccounts {
  // Whose the credential is, asked of the portal as them. Rejects with
  // CredentialRejectedError when the portal doesn't take it; any other
  // failure is taken for the portal being away. Stop when `signal` aborts.
  // The credential stays a Secret until it goes into a request: never in an
  // error, a log or what this answers.
  identify(credential: Credential, signal: AbortSignal): Promise<PortalUser>;
}
