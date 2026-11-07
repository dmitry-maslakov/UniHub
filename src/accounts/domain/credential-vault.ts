import { z } from 'zod';
import { Instance, Secret } from '@app/kernel';
import type { PortalAccountState } from './portal-account.js';

// what a sealed credential is bound to, of the account's snapshot
export type SealedFor = Pick<PortalAccountState, 'id' | 'userId' | 'portal'>;

// What's sealed of a credential: the token, and the portal's site it's of
// (null for a portal of one site), so the address the token goes to can't
// be changed without the keys either
export interface SealedCredential {
  token: Secret;
  url: Instance | null;
}

// as it's sealed: JSON
const Sealed = z.object({ token: z.string().min(1), url: Instance.nullable() });

export const sealedText = ({ token, url }: SealedCredential) =>
  JSON.stringify({ token: token.reveal(), url });

// One sealed before credentials kept their site is its token alone, which
// is never JSON of that shape (no token is a JSON object)
export function fromSealedText(text: string): SealedCredential {
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // the token alone
  }
  const sealed = Sealed.safeParse(json);
  return sealed.success
    ? { token: new Secret(sealed.data.token), url: sealed.data.url }
    : { token: new Secret(text), url: null };
}

// Keeps credentials sealed at rest. A sealed one is nothing without the
// vault's keys, and opens only for the account it was sealed for, the same
// user's of the same portal, so it can't be moved to another one's row nor
// that row to another user or portal.
export abstract class CredentialVault {
  abstract seal(credential: SealedCredential, account: SealedFor): string;
  // UnreadableCredentialError for one that doesn't open
  abstract open(sealed: string, account: SealedFor): SealedCredential;
}
