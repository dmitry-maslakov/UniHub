import { Button, Loader, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/shared/api';
import { apiKeys } from '../api/api-keys';
import classes from './api-keys.module.css';

const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const day = (value: Date | string | null | undefined) =>
  value ? date.format(new Date(value)) : undefined;

// `onRevoked` with the key's id, so a key just shown can go with it
export function KeyList({ onRevoked }: { onRevoked: (id: string) => void }) {
  const queryClient = useQueryClient();
  const keys = useQuery(apiKeys());
  const revoke = useMutation({
    mutationFn: (keyId: string) => authClient.apiKey.delete({ keyId }),
    onSuccess: async (_, id) => {
      onRevoked(id);
      notifications.show({
        message: 'Key revoked. Agents using it are signed out.',
      });
      await queryClient.invalidateQueries(apiKeys());
    },
    onError: () =>
      notifications.show({
        color: 'red',
        message: "Couldn't revoke the key. Try again.",
      }),
  });

  const confirmRevoke = (id: string, name: string) =>
    modals.openConfirmModal({
      title: `Revoke “${name}”?`,
      children: (
        <Text size="sm">
          Anything using this key loses access at once. This can't be undone.
        </Text>
      ),
      labels: { confirm: 'Revoke key', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: () => revoke.mutate(id),
    });

  if (keys.isPending)
    return <Loader size="sm" aria-label="Loading your keys" />;
  if (keys.isError)
    return (
      <Text c="red" role="alert">
        Couldn't load your keys. Reload the page to try again.
      </Text>
    );
  if (!keys.data.length)
    return (
      <Text c="dimmed">
        No keys yet. Name one after the agent or computer it's for, so you know
        which to revoke.
      </Text>
    );

  return (
    <ul className={classes.list} aria-label="Your API keys">
      {keys.data.map((key) => {
        const name = key.name ?? 'Unnamed key';
        const used = day(key.lastRequest);
        return (
          <li key={key.id} className={classes.row}>
            <Stack gap={2} miw={0}>
              <Text fw={600} truncate>
                {name}
              </Text>
              <Text size="sm" c="dimmed">
                {key.start && (
                  <Text span ff="monospace" size="sm">
                    {key.start}…
                  </Text>
                )}
                {key.start && ' · '}
                Created {day(key.createdAt)}
                {key.expiresAt && ` · Expires ${day(key.expiresAt)}`}
                {` · ${used ? `Last used ${used}` : 'Never used'}`}
              </Text>
            </Stack>
            <Button
              variant="subtle"
              color="red"
              size="sm"
              leftSection={<IconTrash size={16} stroke={1.75} />}
              loading={revoke.isPending && revoke.variables === key.id}
              onClick={() => confirmRevoke(key.id, name)}
              aria-label={`Revoke ${name}`}
            >
              Revoke
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
