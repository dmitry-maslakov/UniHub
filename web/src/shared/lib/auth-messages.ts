import type { AuthError } from '@/shared/api';

// Better Auth's answers in the app's words; anything else in Better Auth's
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD:
    "That email and password don't match an account. Check both and try again.",
  USER_ALREADY_EXISTS: 'There is already an account with this email.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'There is already an account with this email.',
  INVALID_TOKEN: 'This link has expired or was already used.',
  PASSWORD_TOO_SHORT: 'Use at least 8 characters.',
  PASSWORD_TOO_LONG: 'Use at most 128 characters.',
};

export function authMessage(error: AuthError | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.status === 429)
    return 'Too many tries in a short time. Wait a minute, then try again.';
  return (error.code && messages[error.code]) ?? error.message ?? fallback;
}
