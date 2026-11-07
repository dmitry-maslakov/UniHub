import type { AuthError } from '@/shared/api';
import { i18n } from '@/shared/i18n';

// the codes Better Auth refuses with that the app has words for
const KNOWN = [
  'INVALID_EMAIL_OR_PASSWORD',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'INVALID_TOKEN',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'INVALID_PASSWORD',
] as const;

const isKnown = (code: string): code is (typeof KNOWN)[number] =>
  (KNOWN as readonly string[]).includes(code);

// Better Auth's answers in the app's words, in the current language;
// anything else in Better Auth's own, else `fallback` (already translated)
export function authMessage(error: AuthError | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.status === 429) return i18n.t('auth:error.tooMany');
  if (error.code && isKnown(error.code))
    return i18n.t(`auth:error.${error.code}`);
  return error.message ?? fallback;
}
