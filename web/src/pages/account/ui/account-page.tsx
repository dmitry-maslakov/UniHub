import { Stack } from '@mantine/core';
import { useSession } from '@/entities/session';
import { PageTitle } from '@/shared/ui';
import { DeleteSection } from './delete-section';
import { PasswordSection } from './password-section';
import { ProfileSection } from './profile-section';
import { ScreenSection } from './screen-section';
import { SessionsSection } from './sessions-section';

// The user's own: name, password, where they're signed in, and the way out
export function AccountPage() {
  const { user } = useSession();
  return (
    <>
      <PageTitle description={user.email}>{user.name}</PageTitle>
      <Stack gap="xxl">
        <ProfileSection />
        <PasswordSection />
        <SessionsSection />
        <ScreenSection />
        <DeleteSection />
      </Stack>
    </>
  );
}
