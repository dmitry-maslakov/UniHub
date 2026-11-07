import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { kindLabel } from './kind-label';

describe('kindLabel', () => {
  it('names the kinds it knows, and shows others as they came', () => {
    const t = i18n.getFixedT('en', 'common');
    expect(kindLabel(t, 'announcement')).toBe('Announcement');
    expect(kindLabel(t, 'discussion')).toBe('Discussion');
    expect(kindLabel(i18n.getFixedT('sr-Latn', 'common'), 'assignment')).toBe(
      'Zadatak',
    );
    expect(kindLabel(t, 'quiz_thing')).toBe('quiz_thing');
  });
});
