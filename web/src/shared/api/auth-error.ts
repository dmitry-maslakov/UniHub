import type { BetterFetchError } from 'better-auth/react';

export interface AuthError {
  status: number;
  // Better Auth's code, such as INVALID_EMAIL_OR_PASSWORD
  code?: string;
  message?: string;
}

// what a failed Better Auth call threw, or undefined for anything else
export function authError(error: unknown): AuthError | undefined {
  if (!(error instanceof Error) || !('status' in error)) return undefined;
  const { status, error: body } = error as BetterFetchError;
  const { code, message, error_description } = (body ?? {}) as Record<
    string,
    string | undefined
  >;
  return {
    status,
    code: code ?? (body as { error?: string })?.error,
    message: message ?? error_description,
  };
}
