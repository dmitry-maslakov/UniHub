import { describe, expect, it } from 'vitest';
import { ApiError } from './api-error';
import { errorCode } from './error-code';

describe('errorCode', () => {
  it("reads the reason from a refusal's body", () => {
    expect(
      errorCode(new ApiError(422, { statusCode: 422, code: 'TOKEN_REFUSED' })),
    ).toBe('TOKEN_REFUSED');
    expect(errorCode(new ApiError(500, undefined))).toBeUndefined();
    expect(errorCode(new ApiError(400, { code: 7 }))).toBeUndefined();
    expect(errorCode(new Error('?'))).toBeUndefined();
  });
});
