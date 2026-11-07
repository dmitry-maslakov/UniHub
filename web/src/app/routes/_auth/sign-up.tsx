import { createFileRoute } from '@tanstack/react-router';
import { SignUpPage, signUpSearch } from '@/pages/sign-up';
import { i18n, pageHead } from '@/shared/i18n';
import { skipIfSignedIn } from '../../router/guards';

export const Route = createFileRoute('/_auth/sign-up')({
  validateSearch: signUpSearch,
  beforeLoad: skipIfSignedIn,
  head: pageHead(() => i18n.t('auth:signUp.title')),
  component: SignUpPage,
});
