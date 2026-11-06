import { createFileRoute } from '@tanstack/react-router';
import { ApiKeysPage } from '@/pages/api-keys';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/settings/api-keys')({
  head: pageHead('API keys'),
  component: ApiKeysPage,
});
