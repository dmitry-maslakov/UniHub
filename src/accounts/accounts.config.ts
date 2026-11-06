import { createSecretKey, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { LinkMode, PortalId } from '@app/kernel';
import { list, settings } from '../platform/config/settings.js';
import type { PortalLink } from './domain/portal-links.js';

// "canvas=token/admins, moodle=token": each portal's link mode, /admins
// when only admins may link an account; a portal not named is shared
const ENTRY = /^([^=]+)=([^/]+)(\/admins)?$/;

const links = list.transform((entries, ctx) => {
  const byPortal = new Map<PortalId, PortalLink>();
  for (const entry of entries) {
    const [, id = '', name = '', admins] = ENTRY.exec(entry) ?? [];
    const portal = PortalId.safeParse(id.trim());
    const mode = LinkMode.safeParse(name.trim());
    if (
      !portal.success ||
      !mode.success ||
      byPortal.has(portal.data) ||
      (admins && mode.data === 'shared')
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'portal=mode or portal=mode/admins, each portal once; the modes are shared and token (/admins for token only)',
      });
      return z.NEVER;
    }
    byPortal.set(portal.data, { mode: mode.data, adminsOnly: !!admins });
  }
  return byPortal as ReadonlyMap<PortalId, PortalLink>;
});

export interface VaultKey {
  version: number;
  // a KeyObject, which never shows its bytes when printed
  key: KeyObject;
}

// 32 random bytes in base64, as openssl rand -base64 32 makes them
const KEY = /^[A-Za-z0-9+/]{43}=$/;

// "2:<key>, 1:<key>": the keys credentials are sealed under, by version,
// the newest first. Never the issue's input: these are keys.
const keys = list.transform((pairs, ctx) => {
  const found: VaultKey[] = [];
  for (const pair of pairs) {
    const at = pair.indexOf(':');
    const version = Number(pair.slice(0, at).trim());
    const key = pair.slice(at + 1).trim();
    if (
      !Number.isSafeInteger(version) ||
      version < 1 ||
      !KEY.test(key) ||
      found.some((k) => k.version === version)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'version:key pairs, each version a whole number from 1, once, and each key 32 random bytes in base64 (openssl rand -base64 32)',
      });
      return z.NEVER;
    }
    found.push({ version, key: createSecretKey(Buffer.from(key, 'base64')) });
  }
  return found.sort((a, b) => b.version - a.version);
});

export const accountsSettings = z
  .object({
    // how each portal's accounts are linked (README, Portal accounts)
    PORTAL_LINKS: links,
    // Keys of their own, apart from BETTER_AUTH_SECRET: the newest seals,
    // any listed opens. A version taken off leaves what it sealed unreadable,
    // old backups' copies too.
    PORTAL_CREDENTIALS_SECRETS: keys,
  })
  .superRefine((env, ctx) => {
    const tokens = [...env.PORTAL_LINKS.values()].some(
      (link) => link.mode !== 'shared',
    );
    if (tokens && env.PORTAL_CREDENTIALS_SECRETS.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['PORTAL_CREDENTIALS_SECRETS'],
        message: 'needed once a portal links accounts by token',
      });
  })
  .transform((env) => ({
    links: env.PORTAL_LINKS,
    keys: env.PORTAL_CREDENTIALS_SECRETS,
  }));

export const accountsConfig = settings('accounts', accountsSettings);
