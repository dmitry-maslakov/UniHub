import { describe, expect, it } from 'vitest';
import { ApiError } from './api-error';
import { isNotFound } from './is-not-found';

describe('isNotFound', () => {
  it('is true for a 404 only', () => {
    expect(isNotFound(new ApiError(404, undefined))).toBe(true);
    expect(isNotFound(new ApiError(500, undefined))).toBe(false);
    expect(isNotFound(new Error('?'))).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });
});
