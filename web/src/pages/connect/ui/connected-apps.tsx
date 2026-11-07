import { Button, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
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
  Section,
} from '@/shared/ui';
import { connectedAppsQuery } from '../api/connected-apps';

// The AI apps let in, each with a revoke that cuts it off for good
export function ConnectedApps() {
  const { t } = useTranslation('connect');
  const { t: common } = useTranslation('common');
  const { date } = useFormat();
  const queryClient = useQueryClient();
  const apps = useQuery(connectedAppsQuery());
  const revoke = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      authClient.oauth2.deleteConsent({ id }),
    onSuccess: async (_, { name }) => {
      notifications.show({ message: t('apps.notify.revoked', { name }) });
      await queryClient.invalidateQueries(connectedAppsQuery());
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('apps.revoke.failed') }),
  });

  const confirmRevoke = (id: string, name: string) =>
    modals.openConfirmModal({
      title: t('apps.revoke.confirm.title', { name }),
      children: <Text size="sm">{t('apps.revoke.confirm.body')}</Text>,
      labels: {
        confirm: t('apps.revoke.confirm.action'),
        cancel: common('action.keep'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => revoke.mutate({ id, name }),
    });

  return (
    <Section title={t('apps.title')} description={t('apps.description')}>
      <QueryState
        query={apps}
        loading={<ListSkeleton rows={2} label={t('apps.loading')} />}
        isEmpty={(data) => !data.length}
        empty={
          <EmptyState title={t('apps.empty.title')}>
            {t('apps.empty.body')}
          </EmptyState>
        }
      >
        {(data) => (
          <RowList label={t('apps.aria')}>
            {data.map((app) => {
              const name = app.name ?? app.host;
              return (
                <Row key={app.id}>
                  <RowText
                    title={name}
                    meta={[
                      app.name && app.host,
                      t('apps.connected', { date: date(app.connectedAt) }),
                    ]}
                  />
                  <RowAction>
                    <Button
                      variant="subtle"
                      color="red"
                      size="sm"
                      loading={
                        revoke.isPending && revoke.variables?.id === app.id
                      }
                      onClick={() => confirmRevoke(app.id, name)}
                      aria-label={t('apps.revoke.aria', { name })}
                    >
                      {t('apps.revoke.action')}
                    </Button>
                  </RowAction>
                </Row>
              );
            })}
          </RowList>
        )}
      </QueryState>
    </Section>
  );
}
