import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { searchErrorKey } from './search-error';

describe('searchErrorKey', () => {
  it('tells a limit hit and an unavailable search from any other failure', () => {
    expect(searchErrorKey(new ApiError(429, null))).toBe('error.rateLimited');
    expect(searchErrorKey(new ApiError(503, null))).toBe('error.unavailable');
    expect(searchErrorKey(new ApiError(500, null))).toBe('error.other');
    expect(searchErrorKey(new TypeError('offline'))).toBe('error.other');
  });
});
