import { createFileRoute } from '@tanstack/react-router';
import { DevicePage, deviceSearch } from '@/pages/device';
import { pageHead } from '@/shared/lib';

// Better Auth's verificationUri: a screen's QR code opens it with its code
export const Route = createFileRoute('/_app/device')({
  validateSearch: deviceSearch,
  head: pageHead('Sign in on another screen'),
  component: DevicePage,
});
