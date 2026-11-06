import { Alert, Stack } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { PageTitle } from '@/shared/ui';
import { NewPasswordForm } from './new-password-form';
import { RequestResetForm } from './request-reset-form';

const route = getRouteApi('/_auth/reset-password');

// Both halves of a reset: asking for the mail, and the page its link opens
export function ResetPasswordPage() {
  const { token, error } = route.useSearch();
  if (token && !error)
    return (
      <>
        <PageTitle description="You'll be signed out everywhere, and your API keys stop working.">
          Choose a new password
        </PageTitle>
        <NewPasswordForm token={token} />
      </>
    );
  return (
    <>
      <PageTitle description="We'll email you a link to choose a new one.">
        Reset your password
      </PageTitle>
      <Stack gap="lg">
        {error && (
          <Alert color="red" role="alert">
            That reset link has expired or was already used. Ask for a new one
            below.
          </Alert>
        )}
        <RequestResetForm />
      </Stack>
    </>
  );
}
