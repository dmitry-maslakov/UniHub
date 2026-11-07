import { Alert, Loader, Stack, Text } from '@mantine/core';
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { authError } from '@/shared/api';
import { deviceRequest } from '../api/device-request';
import { CodeForm } from './code-form';
import { DeviceDecision } from './device-decision';
import { AnchorLink } from '@/shared/ui';

// What became of a code: still to answer, answered, or not one at all
export function DeviceRequestView({ code }: { code: string }) {
  const request = useQuery(deviceRequest(code));

  if (request.isPending)
    return <Loader size="sm" aria-label="Looking up the code" />;

  if (request.isError) {
    const expired = authError(request.error)?.code === 'expired_token';
    return (
      <Stack gap="lg">
        <Alert color="red" role="alert">
          {expired
            ? 'That code has expired. Start again on the screen to get a new one.'
            : "That code isn't one we know. Check it against the screen and enter it again."}
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
      <Icon
        size={32}
        stroke={1.5}
        color={`var(--mantine-color-${approved ? 'petrol' : 'gray'}-filled)`}
      />
      <Text fw={600} size="lg">
        {approved ? 'Approved' : 'Denied'}
      </Text>
      <Text c="dimmed">
        {approved
          ? 'The screen signs in on its own in a moment. You can close this page.'
          : "The screen won't be signed in. If that was a mistake, start again on it."}
      </Text>
      <AnchorLink to="/">Go to your courses</AnchorLink>
    </Stack>
  );
}
