import { createFileRoute } from '@tanstack/react-router';
import { SignInPage, signInSearch } from '@/pages/sign-in';
import { i18n, pageHead } from '@/shared/i18n';
import { skipIfSignedIn } from '../../router/guards';

// Better Auth's loginPage: an OAuth client's signed query arrives here too
export const Route = createFileRoute('/_auth/sign-in')({
  validateSearch: signInSearch,
  beforeLoad: skipIfSignedIn,
  head: pageHead(() => i18n.t('auth:signIn.title')),
  component: SignInPage,
});
