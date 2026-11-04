import { canvasSettings } from './canvas.config.js';

describe('canvas settings', () => {
  const env = {
    CANVAS_URL: 'https://canvas.example.edu',
    CANVAS_TOKEN: '1~abc',
  };

  it('need the school address and a token, and name a user agent', () => {
    expect(canvasSettings.parse(env)).toEqual({
      url: 'https://canvas.example.edu',
      token: '1~abc',
      userAgent: 'UniHub canvas connector',
    });
    expect(
      canvasSettings.parse({ ...env, CANVAS_USER_AGENT: 'hub of A. Student' })
        .userAgent,
    ).toBe('hub of A. Student');
  });

  it('refuse a missing token or an address that is no web one', () => {
    expect(canvasSettings.safeParse({ ...env, CANVAS_TOKEN: '' }).success).toBe(
      false,
    );
    for (const url of ['canvas.example.edu', 'ftp://canvas.example.edu'])
      expect(
        canvasSettings.safeParse({ ...env, CANVAS_URL: url }).success,
      ).toBe(false);
  });
});
