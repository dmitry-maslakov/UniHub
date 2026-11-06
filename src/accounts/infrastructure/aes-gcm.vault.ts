import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Secret } from '@app/kernel';
import { accountsConfig, type VaultKey } from '../accounts.config.js';
import { CredentialVault } from '../domain/credential-vault.js';
import { UnreadableCredentialError } from '../domain/errors.js';

const CIPHER = 'aes-256-gcm';
// GCM's own nonce size, new and random for every seal; its full tag
const IV_BYTES = 12;
const TAG_BYTES = 16;

const text = (bytes: Buffer) => bytes.toString('base64url');
const bytes = (text: string) => Buffer.from(text, 'base64url');

// AES-256-GCM from node:crypto, under PORTAL_CREDENTIALS_SECRETS: sealed
// as "version.iv.ciphertext.tag" (base64url), by the newest key, the
// account's id the additional data it's bound to. Opens any listed version.
@Injectable()
export class AesGcmVault extends CredentialVault {
  private readonly keys: readonly VaultKey[];

  constructor(
    @Inject(accountsConfig.KEY) { keys }: ConfigType<typeof accountsConfig>,
  ) {
    super();
    this.keys = keys;
  }

  seal(credential: Secret, accountId: string) {
    // the settings refuse token links without a key
    const [{ version, key }] = this.keys;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(CIPHER, key, iv, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(accountId));
    const sealed = Buffer.concat([
      cipher.update(credential.reveal(), 'utf8'),
      cipher.final(),
    ]);
    return [
      String(version),
      text(iv),
      text(sealed),
      text(cipher.getAuthTag()),
    ].join('.');
  }

  open(sealed: string, accountId: string) {
    const [version, iv, data, tag, ...more] = sealed.split('.');
    const key = this.keys.find((k) => String(k.version) === version)?.key;
    if (!key || tag === undefined || more.length)
      throw new UnreadableCredentialError();
    try {
      const decipher = createDecipheriv(CIPHER, key, bytes(iv), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(Buffer.from(accountId));
      decipher.setAuthTag(bytes(tag));
      const opened = Buffer.concat([
        decipher.update(bytes(data)),
        decipher.final(),
      ]);
      return new Secret(opened.toString('utf8'));
    } catch {
      // a wrong key, account or tag: GCM tells them apart from nothing
      throw new UnreadableCredentialError();
    }
  }
}
