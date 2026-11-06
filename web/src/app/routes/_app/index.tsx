import { createFileRoute } from '@tanstack/react-router';
import { AccountPage } from '@/pages/account';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/')({
  head: pageHead('Account'),
  component: AccountPage,
});
