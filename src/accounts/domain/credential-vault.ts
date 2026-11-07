import { z } from 'zod';
import { Secret, type Instance } from '@app/kernel';
import { UnreadableCredentialError } from './errors.js';
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

// As it's sealed: JSON. Its site was checked as it was sealed, and what
// opens is what was sealed (the vault authenticates it), so only its shape
// is read back, never the rules again: one a later rule refused would
// otherwise read as a token alone and go to another site.
const Sealed = z.object({
  token: z.string().min(1),
  url: z.string().min(1).brand<'Instance'>().nullable(),
});

export const sealedText = ({ token, url }: SealedCredential) =>
  JSON.stringify({ token: token.reveal(), url });

// One sealed before credentials kept their site is its token alone, which
// is never a JSON object; one that is and isn't of that shape doesn't open
// (UnreadableCredentialError).
export function fromSealedText(text: string): SealedCredential {
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // the token alone
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    return { token: new Secret(text), url: null };
  const sealed = Sealed.safeParse(json);
  if (!sealed.success) throw new UnreadableCredentialError();
  return { token: new Secret(sealed.data.token), url: sealed.data.url };
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
