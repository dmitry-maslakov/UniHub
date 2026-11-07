import { ApiError } from './api-error';
import { authError } from './auth-error';

// The reason a refusal gives, as `code` in its body: the hub's
// ({ statusCode, code, message }) or Better Auth's
export function errorCode(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const code = (error.error as { code?: unknown } | null | undefined)?.code;
    return typeof code === 'string' ? code : undefined;
  }
  return authError(error)?.code;
}
