import { Button, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import {
  EmptyState,
  ListSkeleton,
  QueryState,
  Row,
  RowAction,
  RowList,
  RowText,
} from '@/shared/ui';
import { apiKeys } from '../api/api-keys';

// `onRevoked` with the key's id, so a key just shown can go with it
export function KeyList({ onRevoked }: { onRevoked: (id: string) => void }) {
  const { t } = useTranslation('connect');
  const { t: common } = useTranslation('common');
  const { date } = useFormat();
  const queryClient = useQueryClient();
  const keys = useQuery(apiKeys());
  const revoke = useMutation({
    mutationFn: (keyId: string) => authClient.apiKey.delete({ keyId }),
    onSuccess: async (_, id) => {
      onRevoked(id);
      notifications.show({ message: t('keys.notify.revoked') });
      await queryClient.invalidateQueries(apiKeys());
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('keys.revoke.failed') }),
  });

  const confirmRevoke = (id: string, name: string) =>
    modals.openConfirmModal({
      title: t('keys.revoke.confirm.title', { name }),
      children: <Text size="sm">{t('keys.revoke.confirm.body')}</Text>,
      labels: {
        confirm: t('keys.revoke.confirm.action'),
        cancel: common('action.keep'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => revoke.mutate(id),
    });

  return (
    <Stack gap="xs">
      <Title order={3}>{t('keys.list.title')}</Title>
      <QueryState
        query={keys}
        loading={<ListSkeleton rows={2} label={t('keys.loading')} />}
        isEmpty={(data) => !data.length}
        empty={
          <EmptyState title={t('keys.empty.title')}>
            {t('keys.empty.body')}
          </EmptyState>
        }
      >
        {(data) => (
          <RowList label={t('keys.list.aria')}>
            {data.map((key) => {
              const name = key.name ?? t('keys.unnamed');
              return (
                <Row key={key.id}>
                  <RowText
                    title={name}
                    meta={[
                      key.start && (
                        <Text key="start" span ff="monospace" size="sm">
                          {key.start}…
                        </Text>
                      ),
                      t('keys.meta.created', { date: date(key.createdAt) }),
                      key.expiresAt &&
                        t('keys.meta.expires', { date: date(key.expiresAt) }),
                      key.lastRequest
                        ? t('keys.meta.used', { date: date(key.lastRequest) })
                        : t('keys.meta.neverUsed'),
                    ]}
                  />
                  <RowAction>
                    <Button
                      variant="subtle"
                      color="red"
                      size="sm"
                      leftSection={<IconTrash size={16} stroke={1.75} />}
                      loading={revoke.isPending && revoke.variables === key.id}
                      onClick={() => confirmRevoke(key.id, name)}
                      aria-label={t('keys.revoke.aria', { name })}
                    >
                      {t('keys.revoke.action')}
                    </Button>
                  </RowAction>
                </Row>
              );
            })}
          </RowList>
        )}
      </QueryState>
    </Stack>
  );
}
