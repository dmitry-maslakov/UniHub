import { canvasSettings } from './canvas.config.js';

describe('canvas settings', () => {
  const env = {
    CANVAS_URL: 'https://canvas.example.edu',
    CANVAS_TOKEN: '1~abc',
  };

  it("take the school's address as its origin, and name a user agent", () => {
    expect(
      canvasSettings.parse({
        ...env,
        CANVAS_URL: 'https://Canvas.example.edu/',
      }),
    ).toEqual({
      url: 'https://canvas.example.edu',
      token: '1~abc',
      userAgent: 'course-sync',
    });
    expect(
      canvasSettings.parse({ ...env, CANVAS_USER_AGENT: 'hub of A. Student' })
        .userAgent,
    ).toBe('hub of A. Student');
  });

  it("take no owner's token, for a Canvas read with users' own, nor an address then", () => {
    for (const token of [undefined, ''])
      expect(
        canvasSettings.parse({ ...env, CANVAS_TOKEN: token }).token,
      ).toBeNull();
    expect(canvasSettings.parse({})).toMatchObject({ url: null, token: null });
  });

  it("need the address of the Canvas the owner's token is of", () => {
    for (const url of [undefined, ''])
      expect(
        canvasSettings.safeParse({ ...env, CANVAS_URL: url }).success,
      ).toBe(false);
  });

  it('refuse an address that is no https one', () => {
    for (const url of [
      'ftp://canvas.example.edu',
      'http://canvas.example.edu',
      'https://canvas.example.edu:8443',
    ])
      expect(
        canvasSettings.safeParse({ ...env, CANVAS_URL: url }).success,
      ).toBe(false);
  });
});
