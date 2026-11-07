import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { i18n } from '@/shared/i18n';
import { tokenErrorText } from './token-error';

const canvas = { label: 'Canvas', site: true };
const t = i18n.getFixedT('en', 'sources');

describe('a refused link', () => {
  it("tells a token the portal didn't take from a site that takes none", () => {
    expect(
      tokenErrorText(t, new ApiError(422, { code: 'TOKEN_REFUSED' }), canvas),
    ).toBe("Canvas didn't accept that token. Check it and try again.");
    expect(
      tokenErrorText(
        t,
        new ApiError(422, { code: 'TOKENS_NOT_ALLOWED' }),
        canvas,
      ),
    ).toMatch(/^Instructure hosts this Canvas, and lets apps in only by OAuth/);
  });

  it('points at the address on a site per school', () => {
    expect(tokenErrorText(t, new ApiError(503, undefined), canvas)).toBe(
      'No Canvas answered at that address. Check it, or try again later.',
    );
    expect(
      tokenErrorText(t, new ApiError(503, undefined), {
        label: 'Moodle',
        site: false,
      }),
    ).toBe("Moodle couldn't be reached just now. Try again later.");
  });

  it("says when the hub needs an address the page didn't ask for", () => {
    expect(
      tokenErrorText(t, new ApiError(400, { code: 'URL_NEEDED' }), {
        label: 'School LMS',
        site: false,
      }),
    ).toMatch(/^Linking School LMS needs your school's address/);
    expect(tokenErrorText(t, new ApiError(400, undefined), canvas)).toMatch(
      /^That address or token doesn't look right/,
    );
    expect(
      tokenErrorText(t, new ApiError(400, undefined), {
        label: 'Moodle',
        site: false,
      }),
    ).toMatch(/^That doesn't look like a token/);
  });

  it('says to wait when there were too many tries, and what else failed', () => {
    expect(tokenErrorText(t, new ApiError(429, undefined), canvas)).toMatch(
      /Wait a minute/,
    );
    expect(tokenErrorText(t, new Error('offline'), canvas)).toBe(
      "Couldn't link the account. Try again.",
    );
  });
});
