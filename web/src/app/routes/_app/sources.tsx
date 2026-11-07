import { createFileRoute } from '@tanstack/react-router';
import { SourcesPage } from '@/pages/sources';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/sources')({
  head: pageHead('Sources'),
  component: SourcesPage,
});
