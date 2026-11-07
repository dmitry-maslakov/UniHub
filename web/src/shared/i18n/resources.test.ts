import { describe, expect, it } from 'vitest';
import { resources } from './resources';

type Tree = { [key: string]: string | Tree };

// every leaf as `namespace.path.to.key` -> its text
function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );
}

const all = (lang: keyof typeof resources) =>
  leaves(resources[lang] as unknown as Tree);

describe('resources', () => {
  it('has the same keys in every language', () => {
    expect(all('sr-Latn').map(([key]) => key)).toEqual(
      all('en').map(([key]) => key),
    );
  });

  it('has no empty text', () => {
    for (const lang of ['en', 'sr-Latn'] as const)
      for (const [key, text] of all(lang))
        expect(text.trim(), `${lang} ${key}`).not.toBe('');
  });

  it('gives every plural its one, few and other forms', () => {
    for (const lang of ['en', 'sr-Latn'] as const) {
      const keys = all(lang).map(([key]) => key);
      for (const key of keys.filter((k) => k.endsWith('_one'))) {
        const base = key.slice(0, -'_one'.length);
        expect(keys, `${lang} ${base}`).toContain(`${base}_few`);
        expect(keys, `${lang} ${base}`).toContain(`${base}_other`);
      }
    }
  });
});
