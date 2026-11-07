import { describe, expect, it } from 'vitest';
import { ApiError } from './api-error';
import { errorKind } from './error-kind';

describe('errorKind', () => {
  it('tells offline, too many, unavailable and server failures apart', () => {
    expect(errorKind(new TypeError('Failed to fetch'))).toBe('offline');
    expect(errorKind(new ApiError(429, undefined))).toBe('rateLimited');
    expect(errorKind(new ApiError(503, undefined))).toBe('unavailable');
    expect(errorKind(new ApiError(500, undefined))).toBe('server');
    expect(errorKind(new ApiError(502, undefined))).toBe('server');
    expect(errorKind(new ApiError(400, undefined))).toBe('other');
    expect(errorKind(new Error('?'))).toBe('other');
  });
});
