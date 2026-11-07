import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('device');
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
          <Trans
            t={t}
            i18nKey="asks"
            values={{ app: appName(t, clientId), email: user.email }}
            components={{ strong: <strong /> }}
          />
        </Text>
        <Text
          className={classes.code}
          aria-label={t('codeAria', { spelled: code.split('').join(' ') })}
        >
          {displayCode(code)}
        </Text>
        <Text c="dimmed" size="sm">
          {t('warning')}
        </Text>
      </Stack>
      {answer.isError &&
        (isSessionNotFresh(answer.error) ? (
          <SignInAgain message={t('freshSession')} />
        ) : (
          <Alert color="red" role="alert">
            {authMessage(authError(answer.error), t('failed'))}
          </Alert>
        ))}
      <Group gap="sm">
        <Button
          leftSection={<IconCheck size={18} stroke={1.75} />}
          loading={answer.isPending && answer.variables}
          disabled={answer.isPending}
          onClick={() => answer.mutate(true)}
        >
          {t('approve')}
        </Button>
        <Button
          variant="default"
          leftSection={<IconX size={18} stroke={1.75} />}
          loading={answer.isPending && !answer.variables}
          disabled={answer.isPending}
          onClick={() => answer.mutate(false)}
        >
          {t('deny')}
        </Button>
      </Group>
    </Stack>
  );
}
