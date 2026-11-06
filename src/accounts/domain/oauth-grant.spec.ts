import { inspect } from 'node:util';
import { Secret } from '@app/kernel';
import {
  dueAt,
  grantOf,
  grantToSecret,
  RENEW_BEFORE_MS,
} from './oauth-grant.js';

const at = new Date('2026-11-06T12:00:00Z');
const grant = {
  accessToken: new Secret('access'),
  refreshToken: new Secret('refresh'),
  expiresAt: new Date(at.getTime() + RENEW_BEFORE_MS + 1),
};

describe('an OAuth grant', () => {
  it('seals as one secret, showing none of it, and opens as it was', () => {
    const secret = grantToSecret(grant);
    expect(inspect(secret)).toBe('[secret]');
    const back = grantOf(secret);
    expect([
      back.accessToken.reveal(),
      back.refreshToken?.reveal(),
      back.expiresAt,
    ]).toEqual(['access', 'refresh', grant.expiresAt]);
    expect(
      grantOf(grantToSecret({ ...grant, refreshToken: null, expiresAt: null })),
    ).toMatchObject({ refreshToken: null, expiresAt: null });
  });

  it('is renewed once it runs out within the margin, if it can be', () => {
    expect(dueAt(grant, at)).toBe(false);
    expect(dueAt(grant, new Date(at.getTime() + 2))).toBe(true);
    expect(dueAt({ ...grant, refreshToken: null }, new Date(9e15))).toBe(false);
    expect(dueAt({ ...grant, expiresAt: null }, new Date(9e15))).toBe(false);
  });
});
