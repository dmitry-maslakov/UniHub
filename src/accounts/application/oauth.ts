import type { OAuthServer } from '@app/plugin-sdk';
import type { PortalId, Secret } from '@app/kernel';

// Linking by the portal's consent page: OAuth 2.0's authorization code
// with PKCE, and refresh, as the standard client does them
// (infrastructure), and the consents on their way (README, Portal
// accounts).

// a consent to ask for: where to send the user, and what its answer is
// checked against
export interface Consent {
  url: URL;
  state: string;
  verifier: string;
}

// what the portal's token endpoint gave
export interface OAuthTokens {
  accessToken: Secret;
  // null when the portal gives none (none new, on a refresh)
  refreshToken: Secret | null;
  expiresAt: Date | null;
}

// A refused consent, code or refresh token rejects with OAuthRefusedError;
// any other failure is the portal being away.
export abstract class OAuthClient {
  abstract consent(server: OAuthServer, redirectUri: string): Promise<Consent>;
  // the code in the portal's answer (the callback's query), for tokens
  abstract exchange(
    server: OAuthServer,
    redirectUri: string,
    answer: URLSearchParams,
    expected: { state: string; verifier: string },
  ): Promise<OAuthTokens>;
  abstract refresh(
    server: OAuthServer,
    refreshToken: Secret,
  ): Promise<OAuthTokens>;
}

// a consent on its way: whose, of which portal, and its PKCE verifier
export interface PendingConsent {
  userId: string;
  portal: PortalId;
  verifier: string;
}

// Consents on their way, by their state, each taken once and kept for
// CONSENT_TTL_SECONDS at most.
export const CONSENT_TTL_SECONDS = 600;
export abstract class ConsentStates {
  abstract put(state: string, pending: PendingConsent): Promise<void>;
  // the consent, gone from here from then on; null if there's none
  abstract take(state: string): Promise<PendingConsent | null>;
}
