import { Secret } from '@app/kernel';
import { z } from 'zod';

// What a consent gave the hub, sealed for the account as one secret, as a
// pasted token is: the access token, the refresh token, and when the
// access token runs out.
export interface OAuthGrant {
  accessToken: Secret;
  refreshToken: Secret | null;
  expiresAt: Date | null;
}

// renewed this long before it runs out, so a run that starts with it has
// it for at least that long
export const RENEW_BEFORE_MS = 30 * 60_000;

const sealed = z.object({
  access: z.string(),
  refresh: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
});

export const grantToSecret = (grant: OAuthGrant) =>
  new Secret(
    JSON.stringify({
      access: grant.accessToken.reveal(),
      refresh: grant.refreshToken?.reveal() ?? null,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
    }),
  );

export function grantOf(secret: Secret): OAuthGrant {
  const { access, refresh, expiresAt } = sealed.parse(
    JSON.parse(secret.reveal()),
  );
  return {
    accessToken: new Secret(access),
    refreshToken: refresh === null ? null : new Secret(refresh),
    expiresAt: expiresAt === null ? null : new Date(expiresAt),
  };
}

// whether to renew it now: it runs out within RENEW_BEFORE_MS, and can be
export const dueAt = (grant: OAuthGrant, now: Date) =>
  grant.refreshToken !== null &&
  grant.expiresAt !== null &&
  grant.expiresAt.getTime() - now.getTime() < RENEW_BEFORE_MS;
