import { createFileRoute } from '@tanstack/react-router';
import { AccountPage } from '@/pages/account';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/account')({
  head: pageHead(() => i18n.t('account:title')),
  component: AccountPage,
});
