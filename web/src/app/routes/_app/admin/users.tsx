import { createFileRoute } from '@tanstack/react-router';
import { UsersPage, usersSearch } from '@/pages/admin/users';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/admin/users')({
  validateSearch: usersSearch,
  head: pageHead(() => i18n.t('admin:tabs.users')),
  component: UsersPage,
});
