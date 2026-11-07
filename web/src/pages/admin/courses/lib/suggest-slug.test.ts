import { describe, expect, it } from 'vitest';
import { suggestSlug } from './suggest-slug';

describe('suggestSlug', () => {
  it('makes an address from a name in Latin script, diacritics dropped', () => {
    expect(suggestSlug('Operativni sistemi')).toBe('operativni-sistemi');
    expect(suggestSlug('Arhitektura računara 2')).toBe(
      'arhitektura-racunara-2',
    );
    expect(suggestSlug('Đački')).toBe('djacki');
    expect(suggestSlug('  Mreže & protokoli!  ')).toBe('mreze-protokoli');
  });

  it('cuts a long name at 60 letters without a dash at the end', () => {
    const slug = suggestSlug(`${'a'.repeat(59)} bbb`);
    expect(slug).toBe('a'.repeat(59));
    expect(suggestSlug('x'.repeat(80))).toHaveLength(60);
  });

  it('leaves it empty for a name with no Latin letters', () => {
    expect(suggestSlug('Математика')).toBe('');
    expect(suggestSlug('')).toBe('');
  });
});
