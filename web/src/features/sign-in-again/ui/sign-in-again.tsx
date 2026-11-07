import { Alert, Button, Stack, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionActions } from '@/entities/session';

// In place of the error when an action needs a fresh sign-in: `message` says
// what for, and the button signs out and comes back here once signed in again
export function SignInAgain({ message }: { message: string }) {
  const { t } = useTranslation('auth');
  const here = useRouterState({ select: (s) => s.location.href });
  const { signOut } = useSessionActions();
  const [leaving, setLeaving] = useState(false);
  return (
    <Alert
      icon={<IconShieldCheck size={20} stroke={1.75} />}
      title={t('signInAgain.title')}
    >
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{message}</Text>
        <Button
          size="sm"
          loading={leaving}
          onClick={() => {
            setLeaving(true);
            void signOut(here);
          }}
        >
          {t('signInAgain.action')}
        </Button>
      </Stack>
    </Alert>
  );
}
