import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { tokenErrorText } from './token-error';

const canvas = { label: 'Canvas', site: true };

describe('a refused link', () => {
  it("tells a token the portal didn't take from a site that takes none", () => {
    expect(
      tokenErrorText(new ApiError(422, { code: 'TOKEN_REFUSED' }), canvas),
    ).toBe("Canvas didn't accept that token. Check it and try again.");
    expect(
      tokenErrorText(new ApiError(422, { code: 'TOKENS_NOT_ALLOWED' }), canvas),
    ).toMatch(/only by OAuth/);
  });

  it('points at the address on a site per school', () => {
    expect(tokenErrorText(new ApiError(503, undefined), canvas)).toBe(
      'No Canvas answered at that address. Check it, or try again later.',
    );
    expect(
      tokenErrorText(new ApiError(503, undefined), {
        label: 'Moodle',
        site: false,
      }),
    ).toBe("Moodle couldn't be reached just now. Try again later.");
  });

  it("says when the hub needs an address the page didn't ask for", () => {
    expect(
      tokenErrorText(new ApiError(400, { code: 'URL_NEEDED' }), {
        label: 'School LMS',
        site: false,
      }),
    ).toMatch(/^Linking School LMS needs your school's address/);
    expect(tokenErrorText(new ApiError(400, undefined), canvas)).toMatch(
      /^That address or token doesn't look right/,
    );
  });
});
