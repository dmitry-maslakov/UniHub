import {
  Button,
  Group,
  Stack,
  Text,
  Title,
  type TitleOrder,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { deleteToken } from '../api/portals';
import { isSitePortal } from '../lib/site';
import { statusText } from '../lib/status';
import classes from './sources.module.css';
import { TokenForm } from './token-form';

// One source: where the user's account of it stands, and what to do
export function SourceRow({
  portal,
  order,
}: {
  portal: Schemas['PortalResponse'];
  order: TitleOrder;
}) {
  const { t } = useTranslation('sources');
  const { t: common } = useTranslation('common');
  const format = useFormat();
  const queryClient = useQueryClient();
  const [unavailable, setUnavailable] = useState(false);
  const { label } = portal;
  const unlink = useMutation({
    mutationFn: () => deleteToken(portal.portal),
    onSuccess: async () => {
      notifications.show({ message: t('notify.unlinked', { label }) });
      await queryClient.invalidateQueries({
        queryKey: ['get', '/api/me/portals'],
      });
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('unlink.failed') }),
  });

  const confirmUnlink = () =>
    modals.openConfirmModal({
      title: t('unlink.confirm.title', { label }),
      children: <Text size="sm">{t('unlink.confirm.body', { label })}</Text>,
      labels: {
        confirm: t('unlink.confirm.action'),
        cancel: common('action.keep'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => unlink.mutate(),
    });

  return (
    <li className={classes.row}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} miw={0}>
            <Title order={order}>{label}</Title>
            <Text size="sm" c="dimmed">
              {unavailable
                ? t('unavailable', { label })
                : statusText(t, portal, format.date)}
            </Text>
          </Stack>
          {portal.linked && (
            <Button
              variant="subtle"
              color="red"
              size="sm"
              style={{ flex: 'none' }}
              loading={unlink.isPending}
              onClick={confirmUnlink}
              aria-label={t('unlink.aria', { label })}
            >
              {t('unlink.action')}
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
