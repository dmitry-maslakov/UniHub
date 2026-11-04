import { identitySettings } from './identity.config.js';

const secret = { BETTER_AUTH_SECRET: 'x'.repeat(32) };

describe('identity settings in production', () => {
  const env = { ...secret, NODE_ENV: 'production' };

  it('need the public https address', () => {
    const result = identitySettings.safeParse(env);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      'BETTER_AUTH_URL',
    ]);
    expect(
      identitySettings.safeParse({
        ...env,
        BETTER_AUTH_URL: 'https://hub.uni.test',
      }).success,
    ).toBe(true);
  });
});

describe('TRUSTED_ORIGINS', () => {
  const origins = (TRUSTED_ORIGINS: string) =>
    identitySettings.safeParse({ ...secret, TRUSTED_ORIGINS });

  it('takes exact origins only, as a list', () => {
    expect(origins('').data?.trustedOrigins).toEqual([]);
    expect(
      origins('https://app.uni.test, http://localhost:5173').data
        ?.trustedOrigins,
    ).toEqual(['https://app.uni.test', 'http://localhost:5173']);
    for (const bad of [
      '*',
      'https://*',
      'https://*.uni.test',
      'app.uni.test',
      'https://app.uni.test/',
    ])
      expect(origins(bad).success).toBe(false);
  });

  it('turns Google sign-in on only with both of its settings', () => {
    expect(
      identitySettings.safeParse({ ...secret, GOOGLE_CLIENT_ID: 'id' }).data
        ?.google,
    ).toBeUndefined();
    expect(
      identitySettings.safeParse({
        ...secret,
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 's',
      }).data?.google,
    ).toEqual({ clientId: 'id', clientSecret: 's' });
  });
});
