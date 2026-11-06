import { createFileRoute } from '@tanstack/react-router';
import { ConsentPage } from '@/pages/consent';
import { pageHead } from '@/shared/lib';

// Better Auth's consentPage, once AI apps connect by OAuth
export const Route = createFileRoute('/_app/consent')({
  head: pageHead('Connect an app'),
  component: ConsentPage,
});
