import { inspect } from 'node:util';
import { z } from 'zod';
import { tokenRequest } from './requests.js';

const TOKEN = '1~abcdefghijklmnopqrstuvwxyz';

// the body's own rules; that the route takes it, the e2e spec checks
describe('token request', () => {
  it('takes a token, as a Secret from then on', () => {
    const { token, url } = tokenRequest.parse({ token: TOKEN });
    expect(token.reveal()).toBe(TOKEN);
    expect(inspect(token)).toBe('[secret]');
    expect(url).toBeNull();
  });

  it("takes a school's address as its site, and refuses one that isn't an https site", () => {
    expect(
      tokenRequest.parse({
        token: TOKEN,
        url: 'https://Canvas.example.edu/courses/1',
      }).url,
    ).toBe('https://canvas.example.edu');
    for (const url of [
      '',
      'http://canvas.example.edu',
      'https://10.0.0.1',
      `https://canvas.example.edu/${'x'.repeat(2048)}`,
      42,
    ])
      expect(tokenRequest.safeParse({ token: TOKEN, url }).success).toBe(false);
  });

  it("refuses what can't be one, never saying what it was", () => {
    for (const token of [
      '',
      `${TOKEN} with spaces`,
      `${TOKEN}\r\nX-Injected: 1`,
      `${TOKEN}č`,
      TOKEN.repeat(200),
      42,
    ]) {
      const refused = tokenRequest.safeParse({ token });
      expect(refused.success).toBe(false);
      const said = [
        z.prettifyError(refused.error!),
        JSON.stringify(refused.error!.issues),
      ].join('\n');
      expect(said).not.toContain(TOKEN.slice(0, 8));
    }
  });

  it('describes the token as write-only, for OpenAPI', () => {
    const schema = tokenRequest['~standard'].jsonSchema.input({
      target: 'openapi-3.0',
    });
    expect(schema).toMatchObject({
      properties: { token: { type: 'string', writeOnly: true } },
      required: ['token'],
    });
  });
});
