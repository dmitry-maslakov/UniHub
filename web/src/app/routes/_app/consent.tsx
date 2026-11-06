import { createFileRoute } from '@tanstack/react-router';
import { ConsentPage, consentSearch } from '@/pages/consent';
import { pageHead } from '@/shared/lib';

// Better Auth's consentPage: it arrives with the signed query of an app
// asking to connect
export const Route = createFileRoute('/_app/consent')({
  validateSearch: consentSearch,
  head: pageHead('Connect an app'),
  component: ConsentPage,
});
