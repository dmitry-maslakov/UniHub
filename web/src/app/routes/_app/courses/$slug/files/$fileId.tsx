import { createFileRoute } from '@tanstack/react-router';
import { FilePage, fileSearch } from '@/pages/file';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/courses/$slug/files/$fileId')({
  validateSearch: fileSearch,
  head: pageHead(() => i18n.t('file:head')),
  component: FilePage,
});
