import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { pickErrorText } from './pick-error';

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
