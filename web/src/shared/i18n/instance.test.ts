import { describe, expect, it } from 'vitest';
import { toSupported } from './instance';

describe('toSupported', () => {
  it('reads any Serbian tag, either script, as Serbian in Latin script', () => {
    for (const tag of ['sr', 'sr-RS', 'sr-Cyrl-RS', 'sr-Latn-ME', 'sh'])
      expect(toSupported(tag)).toBe('sr-Latn');
  });

  it('reads anything else by its language', () => {
    expect(toSupported('en-US')).toBe('en');
    expect(toSupported('de-DE')).toBe('de');
  });
});
