import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Schemas } from '@/shared/api';
import { deleteToken } from '../api/portals';
import { isSitePortal } from '../lib/site';
import { statusText } from '../lib/status';
import classes from './sources.module.css';
import { TokenForm } from './token-form';

// One source: where the user's account of it stands, and what to do
export function SourceRow({ portal }: { portal: Schemas['PortalResponse'] }) {
  const queryClient = useQueryClient();
  const [unavailable, setUnavailable] = useState(false);
  const { label } = portal;
  const unlink = useMutation({
    mutationFn: () => deleteToken(portal.portal),
    onSuccess: async () => {
      notifications.show({ message: `${label} is unlinked.` });
      await queryClient.invalidateQueries({
        queryKey: ['get', '/api/me/portals'],
      });
    },
    onError: () =>
      notifications.show({
        color: 'red',
        message: "Couldn't unlink the account. Try again.",
      }),
  });

  const confirmUnlink = () =>
    modals.openConfirmModal({
      title: `Unlink ${label}?`,
      children: (
        <Text size="sm">
          The hub forgets your token and stops reading {label} as you. Courses
          only your account saw stop showing up. You can link it again later.
        </Text>
      ),
      labels: { confirm: 'Unlink', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: () => unlink.mutate(),
    });

  return (
    <li className={classes.row}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} miw={0}>
            <Title order={2}>{label}</Title>
            <Text size="sm" c="dimmed">
              {unavailable
                ? `Linking your own account isn't open to you on ${label}. Ask an admin of the hub if you need it.`
                : statusText(portal)}
            </Text>
          </Stack>
          {portal.linked && (
            <Button
              variant="subtle"
              color="red"
              size="sm"
              loading={unlink.isPending}
              onClick={confirmUnlink}
              aria-label={`Unlink ${label}`}
            >
              Unlink
            </Button>
          )}
        </Group>
        {portal.mode === 'token' && !unavailable && (
          <TokenForm
            portal={portal}
            site={isSitePortal(portal.portal)}
            onUnavailable={() => setUnavailable(true)}
          />
        )}
      </Stack>
    </li>
  );
}
