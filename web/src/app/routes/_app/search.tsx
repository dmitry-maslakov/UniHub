import { createFileRoute } from '@tanstack/react-router';
import { SearchPage, searchSearch } from '@/pages/search';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/search')({
  validateSearch: searchSearch,
  head: pageHead('Search'),
  component: SearchPage,
});
