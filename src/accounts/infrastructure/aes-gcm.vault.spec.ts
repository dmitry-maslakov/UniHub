import { randomBytes } from 'node:crypto';
import { Secret } from '@app/kernel';
import { accountsSettings } from '../accounts.config.js';
import { UnreadableCredentialError } from '../domain/errors.js';
import { AesGcmVault } from './aes-gcm.vault.js';

const key = () => randomBytes(32).toString('base64');
const [ONE, TWO] = [key(), key()];
const vault = (PORTAL_CREDENTIALS_SECRETS: string) =>
  new AesGcmVault(accountsSettings.parse({ PORTAL_CREDENTIALS_SECRETS }));

const TOKEN = '1~the-pasted-token';
const ACCOUNT = '9b2f6a52-7d1c-4a51-9a51-6a1f2c3d4e5f';

describe('AesGcmVault', () => {
  it('seals under the newest key, and opens it again', () => {
    const v = vault(`1:${ONE}, 2:${TWO}`);
    const sealed = v.seal(new Secret(TOKEN), ACCOUNT);

    expect(sealed).toMatch(/^2\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain(TOKEN);
    expect(v.open(sealed, ACCOUNT).reveal()).toBe(TOKEN);
  });

  it('seals anew each time, the same credential never twice alike', () => {
    const v = vault(`1:${ONE}`);
    expect(v.seal(new Secret(TOKEN), ACCOUNT)).not.toBe(
      v.seal(new Secret(TOKEN), ACCOUNT),
    );
  });

  it('opens what an older key sealed while that key is listed', () => {
    const sealed = vault(`1:${ONE}`).seal(new Secret(TOKEN), ACCOUNT);

    expect(vault(`2:${TWO}, 1:${ONE}`).open(sealed, ACCOUNT).reveal()).toBe(
      TOKEN,
    );
    // its version taken off: old backups' copies no longer open either
    expect(() => vault(`2:${TWO}`).open(sealed, ACCOUNT)).toThrow(
      UnreadableCredentialError,
    );
    // another key under the same version
    expect(() => vault(`1:${TWO}`).open(sealed, ACCOUNT)).toThrow(
      UnreadableCredentialError,
    );
  });

  it('opens only for the account it was sealed for, and only as it was', () => {
    const v = vault(`1:${ONE}`);
    const sealed = v.seal(new Secret(TOKEN), ACCOUNT);
    const [version, iv, data, tag] = sealed.split('.');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;

    for (const [bad, account] of [
      [sealed, 'another-account'],
      [[version, iv, flipped.toString('base64url'), tag].join('.'), ACCOUNT],
      [[version, iv, data].join('.'), ACCOUNT],
      [`${sealed}.more`, ACCOUNT],
      ['', ACCOUNT],
    ])
      expect(() => v.open(bad, account)).toThrow(UnreadableCredentialError);
  });
});
