import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { authMessage } from './auth-messages';

afterEach(() => i18n.changeLanguage('en'));

describe('authMessage', () => {
  it('puts a known code into the current language', async () => {
    const error = { status: 401, code: 'INVALID_TOKEN' };
    expect(authMessage(error, 'x')).toBe(
      'This link has expired or was already used.',
    );
    await i18n.changeLanguage('sr-Latn');
    expect(authMessage(error, 'x')).toBe(
      'Ovaj link je istekao ili je već iskorišćen.',
    );
  });

  it('says to wait when there were too many tries', () => {
    expect(authMessage({ status: 429, code: 'WHATEVER' }, 'x')).toMatch(
      /Too many tries/,
    );
  });

  it("keeps Better Auth's own words for a code it has none for, else the fallback", () => {
    expect(authMessage({ status: 400, code: 'ODD', message: 'Odd' }, 'x')).toBe(
      'Odd',
    );
    expect(authMessage({ status: 400 }, 'fallback')).toBe('fallback');
    expect(authMessage(undefined, 'fallback')).toBe('fallback');
  });
});
