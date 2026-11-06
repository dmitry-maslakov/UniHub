import { Alert, Button, Stack, Text } from '@mantine/core';
import { IconMail } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/shared/api';

// Signing in before confirming the email: a new link on request
export function ConfirmEmailFirst({
  email,
  next,
}: {
  email: string;
  next: string;
}) {
  const navigate = useNavigate();
  const resend = useMutation({
    mutationFn: () =>
      authClient.sendVerificationEmail({ email, callbackURL: next }),
    onSuccess: () => navigate({ to: '/check-email', search: { email, next } }),
  });
  return (
    <Alert
      icon={<IconMail size={20} stroke={1.75} />}
      title="Confirm your email first"
    >
      <Stack gap="sm" align="flex-start">
        <Text size="sm">
          Open the link we sent to {email}. If it's not there, we can send a new
          one.
        </Text>
        <Button
          size="sm"
          variant="default"
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          Send a new link
        </Button>
      </Stack>
    </Alert>
  );
}
