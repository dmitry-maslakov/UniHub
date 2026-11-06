import { createFileRoute } from '@tanstack/react-router';
import { SignUpPage, signUpSearch } from '@/pages/sign-up';
import { pageHead } from '@/shared/lib';
import { skipIfSignedIn } from '../../router/guards';

export const Route = createFileRoute('/_auth/sign-up')({
  validateSearch: signUpSearch,
  beforeLoad: skipIfSignedIn,
  head: pageHead('Create your account'),
  component: SignUpPage,
});
