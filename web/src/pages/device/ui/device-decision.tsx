import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { isSessionNotFresh, SignInAgain } from '@/features/sign-in-again';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { deviceRequest } from '../api/device-request';
import { appName, displayCode } from '../lib/user-code';
import classes from './device.module.css';

// The screen's request, its code large, and the user's answer to it
export function DeviceDecision({
  code,
  clientId,
}: {
  code: string;
  clientId?: string;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const answer = useMutation({
    mutationFn: (approve: boolean) =>
      approve
        ? authClient.device.approve({ userCode: code })
        : authClient.device.deny({ userCode: code }),
    onSuccess: () => queryClient.invalidateQueries(deviceRequest(code)),
  });

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Text>
          {appName(clientId)} wants to sign in as <strong>{user.email}</strong>.
        </Text>
        <Text
          className={classes.code}
          aria-label={`Code ${code.split('').join(' ')}`}
        >
          {displayCode(code)}
        </Text>
        <Text c="dimmed" size="sm">
          Approve only if this code is on a screen in front of you right now.
          Anyone who sent you a code can't see your courses unless you approve
          it.
        </Text>
      </Stack>
      {answer.isError &&
        (isSessionNotFresh(answer.error) ? (
          <SignInAgain action="approve a screen" />
        ) : (
          <Alert color="red" role="alert">
            {authMessage(
              authError(answer.error),
              "Couldn't send your answer. Try again.",
            )}
          </Alert>
        ))}
      <Group gap="sm">
        <Button
          leftSection={<IconCheck size={18} stroke={1.75} />}
          loading={answer.isPending && answer.variables}
          disabled={answer.isPending}
          onClick={() => answer.mutate(true)}
        >
          Approve
        </Button>
        <Button
          variant="default"
          leftSection={<IconX size={18} stroke={1.75} />}
          loading={answer.isPending && !answer.variables}
          disabled={answer.isPending}
          onClick={() => answer.mutate(false)}
        >
          Deny
        </Button>
      </Group>
    </Stack>
  );
}
