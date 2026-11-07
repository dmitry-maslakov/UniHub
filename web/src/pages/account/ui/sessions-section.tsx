import { Badge, Button, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/entities/session';
import { authClient } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import {
  ListSkeleton,
  QueryState,
  Row,
  RowAction,
  RowList,
  RowText,
  Section,
} from '@/shared/ui';
import { sessionsQuery } from '../api/sessions';
import { deviceName } from '../lib/device-name';
import { orderSessions } from '../lib/order-sessions';

// Where the account is signed in: this device marked, any other signed out
// one by one or all together
export function SessionsSection() {
  const { t } = useTranslation('account');
  const { t: common } = useTranslation('common');
  const { date, dateTime } = useFormat();
  const queryClient = useQueryClient();
  const { session: current } = useSession();
  const sessions = useQuery(sessionsQuery());
  const refetch = () => queryClient.invalidateQueries(sessionsQuery());
  const failed = () =>
    notifications.show({ color: 'red', message: t('sessions.failed') });

  const signOut = useMutation({
    mutationFn: (token: string) => authClient.revokeSession({ token }),
    onSuccess: refetch,
    onError: failed,
  });
  const signOutOthers = useMutation({
    mutationFn: () => authClient.revokeOtherSessions(),
    onSuccess: async () => {
      notifications.show({ message: t('sessions.notify.others') });
      await refetch();
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('sessions.others.failed') }),
  });

  const confirmOthers = () =>
    modals.openConfirmModal({
      title: t('sessions.others.confirm.title'),
      children: <Text size="sm">{t('sessions.others.confirm.body')}</Text>,
      labels: {
        confirm: t('sessions.others.confirm.action'),
        cancel: common('action.keep'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => signOutOthers.mutate(),
    });

  const label = (userAgent: string | null | undefined) => {
    const { browser, os } = deviceName(userAgent);
    return browser && os
      ? t('sessions.device', { browser, os })
      : (browser ?? os ?? t('sessions.unknownDevice'));
  };

  return (
    <Section
      title={t('sessions.title')}
      description={t('sessions.description')}
    >
      <QueryState
        query={sessions}
        loading={<ListSkeleton rows={2} label={common('state.loading')} />}
      >
        {(data) => (
          <>
            <RowList label={t('sessions.aria')}>
              {orderSessions(data, current.id).map((s) => {
                const isCurrent = s.id === current.id;
                const device = label(s.userAgent);
                return (
                  <Row key={s.id}>
                    <RowText
                      title={device}
                      badges={
                        isCurrent && (
                          <Badge variant="light" color="gray" radius="sm">
                            {t('sessions.thisDevice')}
                          </Badge>
                        )
                      }
                      meta={[
                        s.ipAddress,
                        t('sessions.signedIn', { date: date(s.createdAt) }),
                        t('sessions.active', { date: dateTime(s.updatedAt) }),
                      ]}
                    />
                    {!isCurrent && (
                      <RowAction>
                        <Button
                          variant="subtle"
                          size="sm"
                          aria-label={t('sessions.signOut.aria', { device })}
                          loading={
                            signOut.isPending && signOut.variables === s.token
                          }
                          onClick={() => signOut.mutate(s.token)}
                        >
                          {t('sessions.signOut.action')}
                        </Button>
                      </RowAction>
                    )}
                  </Row>
                );
              })}
            </RowList>
            {data.length > 1 && (
              <Button
                variant="default"
                mt="sm"
                w="fit-content"
                loading={signOutOthers.isPending}
                onClick={confirmOthers}
              >
                {t('sessions.others.action')}
              </Button>
            )}
          </>
        )}
      </QueryState>
    </Section>
  );
}
