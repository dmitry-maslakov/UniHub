import { canvasSettings } from './canvas.config.js';

describe('canvas settings', () => {
  const env = {
    CANVAS_URL: 'https://canvas.example.edu',
    CANVAS_TOKEN: '1~abc',
  };

  it('need the school address, and name a user agent', () => {
    expect(canvasSettings.parse(env)).toEqual({
      url: 'https://canvas.example.edu',
      token: '1~abc',
      userAgent: 'course-sync',
      oauth: null,
    });
    expect(
      canvasSettings.parse({ ...env, CANVAS_USER_AGENT: 'hub of A. Student' })
        .userAgent,
    ).toBe('hub of A. Student');
  });

  it("take no owner's token, for a Canvas read with users' own", () => {
    for (const token of [undefined, ''])
      expect(
        canvasSettings.parse({ ...env, CANVAS_TOKEN: token }).token,
      ).toBeNull();
  });

  it('take a developer key for the consent page, its id and key both or neither', () => {
    const key = {
      CANVAS_OAUTH_CLIENT_ID: '10000000000001',
      CANVAS_OAUTH_CLIENT_SECRET: 'the-key',
    };
    const { oauth } = canvasSettings.parse({ ...env, ...key });
    expect(oauth?.clientId).toBe('10000000000001');
    expect(oauth?.clientSecret.reveal()).toBe('the-key');
    expect(canvasSettings.parse(env).oauth).toBeNull();
    for (const half of [
      { CANVAS_OAUTH_CLIENT_ID: '1' },
      { CANVAS_OAUTH_CLIENT_SECRET: 'k' },
    ])
      expect(canvasSettings.safeParse({ ...env, ...half }).success).toBe(false);
  });

  it('refuse an address that is no https one', () => {
    for (const url of [
      'canvas.example.edu',
      'ftp://canvas.example.edu',
      'http://canvas.example.edu',
    ])
      expect(
        canvasSettings.safeParse({ ...env, CANVAS_URL: url }).success,
      ).toBe(false);
  });
});
