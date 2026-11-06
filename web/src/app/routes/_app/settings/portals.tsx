import { createFileRoute } from '@tanstack/react-router';
import { PortalAccountsPage } from '@/pages/portal-accounts';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/settings/portals')({
  head: pageHead('Portal accounts'),
  component: PortalAccountsPage,
});
