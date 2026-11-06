import { createFileRoute } from '@tanstack/react-router';
import { SignInPage, signInSearch } from '@/pages/sign-in';
import { pageHead } from '@/shared/lib';
import { skipIfSignedIn } from '../../router/guards';

// Better Auth's loginPage: an OAuth client's signed query arrives here too
export const Route = createFileRoute('/_auth/sign-in')({
  validateSearch: signInSearch,
  beforeLoad: skipIfSignedIn,
  head: pageHead('Sign in'),
  component: SignInPage,
});
