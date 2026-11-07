import { createFileRoute } from '@tanstack/react-router';
import { CheckEmailPage, checkEmailSearch } from '@/pages/check-email';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_auth/check-email')({
  validateSearch: checkEmailSearch,
  head: pageHead(() => i18n.t('auth:checkEmail.title')),
  component: CheckEmailPage,
});
