import { createFileRoute } from '@tanstack/react-router';
import { CheckEmailPage, checkEmailSearch } from '@/pages/check-email';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_auth/check-email')({
  validateSearch: checkEmailSearch,
  head: pageHead('Check your email'),
  component: CheckEmailPage,
});
