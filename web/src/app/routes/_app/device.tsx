import { createFileRoute } from '@tanstack/react-router';
import { DevicePage, deviceSearch } from '@/pages/device';
import { i18n, pageHead } from '@/shared/i18n';

// Better Auth's verificationUri: a screen's QR code opens it with its code
export const Route = createFileRoute('/_app/device')({
  validateSearch: deviceSearch,
  head: pageHead(() => i18n.t('device:title')),
  component: DevicePage,
});
