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
