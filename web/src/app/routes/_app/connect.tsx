import { createFileRoute } from '@tanstack/react-router';
import { ConnectPage } from '@/pages/connect';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/connect')({
  head: pageHead(() => i18n.t('connect:title')),
  component: ConnectPage,
});
