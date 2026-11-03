import { envSchema } from './config.js';

const tokens = (value: string) =>
  envSchema.shape.CONNECTOR_TOKENS.safeParse(value).success;

describe('CONNECTOR_TOKENS', () => {
  it('takes portal=token pairs', () => {
    expect(tokens('')).toBe(true);
    expect(tokens('acs=0123456789abcdef, teams=fedcba9876543210')).toBe(true);
  });

  it('refuses what would quietly lock a connector out', () => {
    expect(tokens('acs0123456789abcdef')).toBe(false);
    expect(tokens('acs=short')).toBe(false);
    expect(tokens('ACS=0123456789abcdef')).toBe(false);
    expect(tokens('a=0123456789abcdef,b=0123456789abcdef')).toBe(false);
  });
});

describe('production', () => {
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://h/db',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
  };

  it('needs real mail and a public address', () => {
    const result = envSchema.safeParse(env);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      'SMTP_URL',
      'BETTER_AUTH_URL',
    ]);
    expect(
      envSchema.safeParse({
        ...env,
        SMTP_URL: 'smtp://u:p@mail.uni.test:587',
        BETTER_AUTH_URL: 'https://hub.uni.test',
      }).success,
    ).toBe(true);
  });
});
