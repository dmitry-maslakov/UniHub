import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage, resetPasswordSearch } from '@/pages/reset-password';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: resetPasswordSearch,
  head: pageHead(() => i18n.t('auth:reset.title')),
  component: ResetPasswordPage,
});
