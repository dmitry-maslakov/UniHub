import { Alert, Button, Stack, Text } from '@mantine/core';
import { IconMail } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/shared/api';

// Signing in before confirming the email: a new link on request
export function ConfirmEmailFirst({
  email,
  next,
}: {
  email: string;
  next: string;
}) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const resend = useMutation({
    mutationFn: () =>
      authClient.sendVerificationEmail({ email, callbackURL: next }),
    onSuccess: () => navigate({ to: '/check-email', search: { email, next } }),
  });
  return (
    <Alert
      icon={<IconMail size={20} stroke={1.75} />}
      title={t('confirmFirst.title')}
    >
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{t('confirmFirst.body', { email })}</Text>
        <Button
          size="sm"
          variant="default"
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {t('confirmFirst.action')}
        </Button>
      </Stack>
    </Alert>
  );
}
