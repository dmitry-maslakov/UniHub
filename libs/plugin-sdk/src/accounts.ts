import type { Secret } from '@app/kernel';

// Users' own accounts of a portal, beyond the shared one the plugin's
// settings give (README, Portal accounts): a connector names the
// AccountLinks it takes in its decorator (the hub refuses any other at
// startup), and linking one asks it whose a credential is.

// What a user gave the hub to act as them on the portal: a token they
// pasted, or the access token the portal's consent page gave (the hub
// renews it with its refresh token before it runs out). Either goes as a
// bearer token.
export type Credential =
  { kind: 'token'; token: Secret } | { kind: 'oauth'; accessToken: Secret };

// the bearer token a credential is, to put in a request
export const bearerOf = (credential: Credential) =>
  credential.kind === 'token' ? credential.token : credential.accessToken;

// whose a credential is, as the portal knows them
export interface PortalUser {
  // the portal's own id for the user, never a name or an email
  id: string;
  // when the credential stops working; null if it doesn't, or the portal
  // won't say
  expiresAt: Date | null;
}

// Where a portal's consent page and tokens are, and the hub's client there
// (one the portal's admins registered for the hub: Canvas's developer
// key), for linking by OAuth 2.0's authorization code with PKCE
export interface OAuthServer {
  // the portal's own address, the authorization server's issuer
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: Secret;
  // the scopes to ask for, space separated; none for the portal's default
  scope?: string;
}

// What a connector that links accounts by OAuth does besides saying whose a
// credential is (IdentifiesAccounts, as the consent page gave it).
export interface LinksByOAuth {
  // null while its settings name no client: the app doesn't start with the
  // portal linked by OAuth then
  oauthServer(): OAuthServer | null;
  // Takes the credential back at the portal, its own way (an account
  // unlinked or replaced). Rejects when it couldn't; one the portal no
  // longer takes is taken back already.
  revoke(credential: Credential, signal: AbortSignal): Promise<void>;
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
