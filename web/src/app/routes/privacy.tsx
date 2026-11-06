import { createFileRoute } from '@tanstack/react-router';
import { PrivacyPage } from '@/pages/privacy';
import { pageHead } from '@/shared/lib';
import { AuthLayout } from '@/widgets/auth-layout';

// Open to anyone, signed in or not: no session guard, and the sign-in
// pages' frame around it
export const Route = createFileRoute('/privacy')({
  head: pageHead('Privacy policy'),
  component: () => (
    <AuthLayout width="40rem">
      <PrivacyPage />
    </AuthLayout>
  ),
});
