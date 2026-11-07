import { inspect } from 'node:util';
import { Instance, Secret } from '@app/kernel';
import { fromSealedText, sealedText } from './credential-vault.js';
import { UnreadableCredentialError } from './errors.js';

const SITE = Instance.parse('https://canvas.example.edu');

describe("a sealed credential's text", () => {
  it('holds the token and its site, and gives them back', () => {
    const text = sealedText({ token: new Secret('1~abc'), url: SITE });
    const { token, url } = fromSealedText(text);
    expect(token.reveal()).toBe('1~abc');
    expect(url).toBe(SITE);
    expect(inspect(fromSealedText(text))).not.toContain('1~abc');
  });

  it('reads one sealed before credentials kept their site as its token alone', () => {
    for (const legacy of ['1~abc', '{not json', '42', 'null', '["1~abc"]']) {
      const { token, url } = fromSealedText(legacy);
      expect(token.reveal()).toBe(legacy);
      expect(url).toBeNull();
    }
  });

  it("gives back the site it was sealed with as it is, and doesn't open one of another shape", () => {
    // what the rules of a site may refuse some day
    const kept = 'https://canvas.example.edu:8443/school';
    expect(fromSealedText(JSON.stringify({ token: 'x', url: kept })).url).toBe(
      kept,
    );
    for (const broken of [
      { token: 'x' },
      { token: '', url: null },
      { url: 'https://canvas.example.edu' },
      { token: 1, url: null },
    ])
      expect(() => fromSealedText(JSON.stringify(broken))).toThrow(
        UnreadableCredentialError,
      );
  });
});
