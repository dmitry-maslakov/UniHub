import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { pickErrorText, showWithErrorText } from './pick-error';

describe('pickErrorText', () => {
  it('says what to do for each refusal', () => {
    expect(
      pickErrorText(new ApiError(422, { code: 'TOO_MANY_PICKS' }), true),
    ).toMatch(/up to 100/);
    expect(pickErrorText(new ApiError(429, null), true)).toMatch(
      /Wait a minute/,
    );
    expect(pickErrorText(new ApiError(404, null), true)).toMatch(/no longer/);
  });

  it('says which change failed otherwise', () => {
    expect(pickErrorText(new Error('offline'), true)).toBe(
      "Couldn't pick the course. Try again.",
    );
    expect(pickErrorText(new ApiError(500, null), false)).toBe(
      "Couldn't unpick the course. Try again.",
    );
  });
});

describe('showWithErrorText', () => {
  it('says the course to show with is no longer theirs, or what else went wrong', () => {
    expect(
      showWithErrorText(new ApiError(422, { code: 'NOT_YOUR_COURSE' })),
    ).toMatch(/isn't one you read/);
    expect(showWithErrorText(new ApiError(404, null))).toMatch(/no longer/);
    expect(showWithErrorText(new ApiError(429, null))).toMatch(/Wait a minute/);
    expect(showWithErrorText(new Error('offline'))).toBe(
      "Couldn't move the course. Try again.",
    );
  });
});
