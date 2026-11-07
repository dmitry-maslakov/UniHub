import { inspect } from 'node:util';
import { Instance, Secret } from '@app/kernel';
import { fromSealedText, sealedText } from './credential-vault.js';

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
    for (const legacy of ['1~abc', '{"token":"x"}', '{not json', '42']) {
      const { token, url } = fromSealedText(legacy);
      expect(token.reveal()).toBe(legacy);
      expect(url).toBeNull();
    }
  });
});
