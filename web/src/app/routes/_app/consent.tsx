import { createFileRoute } from '@tanstack/react-router';
import { ConsentPage, consentSearch } from '@/pages/consent';
import { i18n, pageHead } from '@/shared/i18n';

// Better Auth's consentPage: it arrives with the signed query of an app
// asking to connect
export const Route = createFileRoute('/_app/consent')({
  validateSearch: consentSearch,
  head: pageHead(() => i18n.t('consent:head')),
  component: ConsentPage,
});
