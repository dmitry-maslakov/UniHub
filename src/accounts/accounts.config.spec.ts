import { randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import { z } from 'zod';
import { accountsSettings } from './accounts.config.js';

const KEY_1 = randomBytes(32).toString('base64');
const KEY_2 = randomBytes(32).toString('base64');

const parse = (env: Record<string, string>) => accountsSettings.safeParse(env);
const links = (PORTAL_LINKS: string) =>
  parse({ PORTAL_LINKS, PORTAL_CREDENTIALS_SECRETS: `1:${KEY_1}` });

describe('PORTAL_LINKS', () => {
  it('leaves every portal shared by default', () => {
    expect(parse({}).data?.links.size).toBe(0);
  });

  it('maps each portal to its mode, and who may link', () => {
    const { data } = links('canvas=token/admins, moodle=token, teams=shared');
    expect([...data!.links]).toEqual([
      ['canvas', { mode: 'token', adminsOnly: true }],
      ['moodle', { mode: 'token', adminsOnly: false }],
      ['teams', { mode: 'shared', adminsOnly: false }],
    ]);
  });

  it('refuses a mode there is none of yet, or an entry it would misread', () => {
    for (const bad of [
      'canvas=oauth',
      'canvas=connector',
      'canvas',
      'Canvas=token',
      'canvas=token/students',
      'canvas=shared/admins',
      'canvas=token,canvas=shared',
    ])
      expect(links(bad).success, bad).toBe(false);
  });
});

describe('PORTAL_CREDENTIALS_SECRETS', () => {
  it('takes keys by version, the newest first', () => {
    const { data } = parse({
      PORTAL_CREDENTIALS_SECRETS: `1:${KEY_1}, 2:${KEY_2}`,
    });
    expect(data!.keys.map((k) => k.version)).toEqual([2, 1]);
    expect(data!.keys[0].key.export().toString('base64')).toBe(KEY_2);
  });

  it('refuses a key that is no 32 random bytes, or a version twice', () => {
    for (const bad of [
      'abc',
      `${KEY_1}`,
      `0:${KEY_1}`,
      `1.5:${KEY_1}`,
      '1:c2hvcnQ=',
      `1:${KEY_1}, 1:${KEY_2}`,
    ])
      expect(parse({ PORTAL_CREDENTIALS_SECRETS: bad }).success, bad).toBe(
        false,
      );
  });

  it('is needed once a portal links by token, and never shows a key', () => {
    const missing = parse({ PORTAL_LINKS: 'canvas=token' });
    expect(missing.success).toBe(false);
    expect(z.prettifyError(missing.error!)).toContain(
      'PORTAL_CREDENTIALS_SECRETS',
    );

    const bad = parse({ PORTAL_CREDENTIALS_SECRETS: `1:${KEY_1}x` });
    expect(z.prettifyError(bad.error!)).not.toContain(KEY_1);
    expect(inspect(links('canvas=token').data)).not.toContain(KEY_1);
  });
});
