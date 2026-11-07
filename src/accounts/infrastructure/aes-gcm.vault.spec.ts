import { randomBytes } from 'node:crypto';
import { Instance, NO_INSTANCE, PortalId, Secret } from '@app/kernel';
import { accountsSettings } from '../accounts.config.js';
import type { SealedFor } from '../domain/credential-vault.js';
import { UnreadableCredentialError } from '../domain/errors.js';
import type { PortalAccountState } from '../domain/portal-account.js';
import { AesGcmVault } from './aes-gcm.vault.js';

const key = () => randomBytes(32).toString('base64');
const [ONE, TWO] = [key(), key()];
const vault = (PORTAL_CREDENTIALS_SECRETS: string) =>
  new AesGcmVault(accountsSettings.parse({ PORTAL_CREDENTIALS_SECRETS }));

const TOKEN = '1~the-pasted-token';
const SITE = Instance.parse('https://canvas.example.edu');
const credential = () => ({ token: new Secret(TOKEN), url: SITE });
// an account's snapshot, of what a seal is bound to
const ACCOUNT: PortalAccountState = {
  id: '9b2f6a52-7d1c-4a51-9a51-6a1f2c3d4e5f',
  userId: 'ana',
  portal: PortalId.parse('canvas'),
  instance: SITE,
  mode: 'token',
  portalUser: '4242',
  status: 'linked',
  expiresAt: null,
};

describe('AesGcmVault', () => {
  it('seals under the newest key, and opens it again, its site with it', () => {
    const v = vault(`1:${ONE}, 2:${TWO}`);
    const sealed = v.seal(credential(), ACCOUNT);

    expect(sealed).toMatch(/^2\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain(TOKEN);
    expect(sealed).not.toContain('example');
    const opened = v.open(sealed, ACCOUNT);
    expect(opened.token.reveal()).toBe(TOKEN);
    expect(opened.url).toBe(SITE);
    const none = { ...ACCOUNT, instance: NO_INSTANCE };
    expect(
      v.open(v.seal({ token: new Secret(TOKEN), url: null }, none), none).url,
    ).toBeNull();
  });

  it('seals anew each time, the same credential never twice alike', () => {
    const v = vault(`1:${ONE}`);
    expect(v.seal(credential(), ACCOUNT)).not.toBe(
      v.seal(credential(), ACCOUNT),
    );
  });

  it('opens what an older key sealed while that key is listed', () => {
    const sealed = vault(`1:${ONE}`).seal(credential(), ACCOUNT);

    expect(
      vault(`2:${TWO}, 1:${ONE}`).open(sealed, ACCOUNT).token.reveal(),
    ).toBe(TOKEN);
    // its version taken off: old backups' copies no longer open either
    expect(() => vault(`2:${TWO}`).open(sealed, ACCOUNT)).toThrow(
      UnreadableCredentialError,
    );
    // another key under the same version
    expect(() => vault(`1:${TWO}`).open(sealed, ACCOUNT)).toThrow(
      UnreadableCredentialError,
    );
  });

  it("opens only for the account it was sealed for, that user's of that portal, and only as it was", () => {
    const v = vault(`1:${ONE}`);
    const sealed = v.seal(credential(), ACCOUNT);
    const [version, iv, data, tag] = sealed.split('.');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;

    const cases: [string, SealedFor][] = [
      [sealed, { ...ACCOUNT, id: '0e5c1b7a-2f4d-4c3b-8a1e-5d6f7a8b9c0d' }],
      // the row moved to another user, or to another portal
      [sealed, { ...ACCOUNT, userId: 'bo' }],
      [sealed, { ...ACCOUNT, portal: PortalId.parse('moodle') }],
      // a field's end moved into the next one
      [sealed, { ...ACCOUNT, userId: 'an', portal: PortalId.parse('acanvas') }],
      [[version, iv, flipped.toString('base64url'), tag].join('.'), ACCOUNT],
      [[version, iv, data].join('.'), ACCOUNT],
      [`${sealed}.more`, ACCOUNT],
      ['', ACCOUNT],
    ];
    for (const [bad, account] of cases)
      expect(() => v.open(bad, account)).toThrow(UnreadableCredentialError);
    // what isn't bound may change: a run's status, a relink's expiry
    const later: PortalAccountState = {
      ...ACCOUNT,
      status: 'expired',
      expiresAt: new Date('2026-12-30T08:00:00Z'),
    };
    expect(v.open(sealed, later).token.reveal()).toBe(TOKEN);
  });
});
