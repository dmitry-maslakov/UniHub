import { createFileRoute } from '@tanstack/react-router';
import { SearchPage, searchSearch } from '@/pages/search';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/search')({
  validateSearch: searchSearch,
  head: pageHead(() => i18n.t('search:title')),
  component: SearchPage,
});
