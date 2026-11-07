import { createFileRoute } from '@tanstack/react-router';
import { SignInPhonePage, signInPhoneSearch } from '@/pages/sign-in-phone';
import { i18n, pageHead } from '@/shared/i18n';
import { skipIfSignedIn } from '../../router/guards';

// Signing in by a QR code a phone approves (device authorization)
export const Route = createFileRoute('/_auth/sign-in_/phone')({
  validateSearch: signInPhoneSearch,
  beforeLoad: skipIfSignedIn,
  head: pageHead(() => i18n.t('auth:phone.title')),
  component: SignInPhonePage,
});
