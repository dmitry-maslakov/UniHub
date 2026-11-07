import { Alert, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authError } from '@/shared/api';
import { AnchorLink, TextSkeleton } from '@/shared/ui';
import { deviceRequest } from '../api/device-request';
import { CodeForm } from './code-form';
import { DeviceDecision } from './device-decision';

// What became of a code: still to answer, answered, or not one at all
export function DeviceRequestView({ code }: { code: string }) {
  const { t } = useTranslation(['device', 'shell']);
  const request = useQuery(deviceRequest(code));

  if (request.isPending)
    return <TextSkeleton lines={2} label={t('lookingUp')} />;

  if (request.isError) {
    const expired = authError(request.error)?.code === 'expired_token';
    return (
      <Stack gap="lg">
        <Alert color="red" role="alert">
          {expired ? t('expired') : t('unknown')}
        </Alert>
        <CodeForm />
      </Stack>
    );
  }

  const { status, client_id } = request.data;
  if (status === 'pending')
    return <DeviceDecision code={code} clientId={client_id} />;

  const approved = status === 'approved';
  const Icon = approved ? IconCircleCheck : IconCircleX;
  return (
    <Stack gap="md" align="flex-start">
      <ThemeIcon
        variant="transparent"
        size={32}
        c={approved ? 'petrol' : 'dimmed'}
      >
        <Icon size={32} stroke={1.5} />
      </ThemeIcon>
      <Text fw={600} size="lg">
        {approved ? t('approved.title') : t('denied.title')}
      </Text>
      <Text c="dimmed">{approved ? t('approved.body') : t('denied.body')}</Text>
      <AnchorLink to="/">{t('shell:notFound.home')}</AnchorLink>
    </Stack>
  );
}
