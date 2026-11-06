import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage, resetPasswordSearch } from '@/pages/reset-password';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: resetPasswordSearch,
  head: pageHead('Reset your password'),
  component: ResetPasswordPage,
});
