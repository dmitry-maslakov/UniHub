import { Alert, Button, Stack, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useSessionActions } from '@/entities/session';

// In place of the error when an action needs a fresh sign-in: signs out
// and comes back here once signed in again
export function SignInAgain({ action }: { action: string }) {
  const here = useRouterState({ select: (s) => s.location.href });
  const { signOut } = useSessionActions();
  const [leaving, setLeaving] = useState(false);
  return (
    <Alert
      icon={<IconShieldCheck size={20} stroke={1.75} />}
      title="Sign in again to continue"
    >
      <Stack gap="sm" align="flex-start">
        <Text size="sm">
          To {action}, you need to have signed in within the last day. You'll
          come straight back here.
        </Text>
        <Button
          size="sm"
          loading={leaving}
          onClick={() => {
            setLeaving(true);
            void signOut(here);
          }}
        >
          Sign in again
        </Button>
      </Stack>
    </Alert>
  );
}
