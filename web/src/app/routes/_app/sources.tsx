import { createFileRoute } from '@tanstack/react-router';
import { SourcesPage } from '@/pages/sources';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/sources')({
  head: pageHead(() => i18n.t('sources:title')),
  component: SourcesPage,
});
