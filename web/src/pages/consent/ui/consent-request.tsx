import { Alert, List, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useSession, useSessionActions } from '@/entities/session';
import { PageTitle } from '@/shared/ui';
import { publicClient } from '../api/consent';
import type { ConsentRequest } from '../lib/request';
import { ConsentDecision } from './consent-decision';

// Who asks, what they'd be able to do, and where the user returns to
export function ConsentRequestView({ request }: { request: ConsentRequest }) {
  const { user } = useSession();
  const { signOut } = useSessionActions();
  const here = useRouterState({ select: (s) => s.location.href });
  const [leaving, setLeaving] = useState(false);
  const client = useQuery(publicClient(request.clientId));

  return (
    <>
      <PageTitle
        description={
          client.data?.name
            ? `It calls itself “${client.data.name}”. Allow it only if that is the app you just used.`
            : 'Allow it only if this is the app you just used.'
        }
      >
        {request.requester} wants to read your courses
      </PageTitle>
      <Stack gap="xl">
        <Stack gap="xs">
          <Title order={2}>It will be able to</Title>
          <List spacing={4}>
            <List.Item>
              Read and search your courses, posts and files (read-only)
            </List.Item>
            <List.Item>
              Stay connected until you change your password, or for 30 days
              after you last use it
            </List.Item>
          </List>
        </Stack>
        <Text>
          You'll return to <strong>{request.returnTo}</strong>
          {request.insecure && ' (not encrypted)'}
        </Text>
        {request.loopback && (
          <Alert
            color="red"
            role="alert"
            icon={<IconAlertTriangle size={20} stroke={1.75} />}
            title="This sends you back to this computer"
          >
            Only a program running on this computer gets access. Allow it only
            if you just started it yourself.
          </Alert>
        )}
        <ConsentDecision />
        <Text size="sm" c="dimmed">
          Signed in as {user.email}.{' '}
          <Text
            span
            size="sm"
            c="var(--mantine-primary-color-filled)"
            component="button"
            type="button"
            style={{
              all: 'unset',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onClick={() => {
              setLeaving(true);
              void signOut(here);
            }}
            aria-disabled={leaving}
          >
            Not you?
          </Text>
        </Text>
      </Stack>
    </>
  );
}
