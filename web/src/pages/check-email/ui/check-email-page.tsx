import { Button, Group, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { authClient, authError } from '@/shared/api';
import { authMessage, safeNext } from '@/shared/lib';
import { AnchorLink, PageTitle } from '@/shared/ui';

const route = getRouteApi('/_auth/check-email');

export function CheckEmailPage() {
  const { email, next } = route.useSearch();
  const resend = useMutation({
    mutationFn: (to: string) =>
      authClient.sendVerificationEmail({
        email: to,
        callbackURL: safeNext(next),
      }),
  });
  return (
    <>
      <PageTitle>Check your email</PageTitle>
      <Stack gap="lg">
        <Text>
          We sent a link to {email ? <strong>{email}</strong> : 'your email'}.
          Open it to confirm your address, and you're signed in.
        </Text>
        <Text c="dimmed" size="sm">
          Nothing after a few minutes? Look in your spam folder, or ask for a
          new link.
        </Text>
        <Group gap="md">
          {email && (
            <Button
              variant="default"
              loading={resend.isPending}
              disabled={resend.isSuccess}
              onClick={() => resend.mutate(email)}
            >
              {resend.isSuccess ? 'New link sent' : 'Send a new link'}
            </Button>
          )}
          <AnchorLink to="/sign-in" search={{ next }}>
            Back to sign in
          </AnchorLink>
        </Group>
        {resend.isError && (
          <Text c="red" size="sm" role="alert">
            {authMessage(
              authError(resend.error),
              "Couldn't send a new link. Try again.",
            )}
          </Text>
        )}
      </Stack>
    </>
  );
}
