import { ActionIcon, Menu, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconBan,
  IconCircleCheck,
  IconDots,
  IconShieldCheck,
  IconShieldOff,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAdmin } from '@/entities/session';
import { authClient } from '@/shared/api';
import { BanModal } from './ban-modal';

type Notify = 'madeAdmin' | 'removedAdmin' | 'banned' | 'unbanned';

// What an admin does to another user: their role, a ban, and taking it back.
// Better Auth's admin plugin does each, and the hub checks the role again.
export function UserActions({
  user,
}: {
  user: {
    id: string;
    name: string;
    role?: string | null;
    banned?: boolean | null;
  };
}) {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const queryClient = useQueryClient();
  const [banning, setBanning] = useState(false);
  const { id: userId, name } = user;
  const change = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; done: Notify }) =>
      run(),
    onSuccess: async (_, { done }) => {
      setBanning(false);
      notifications.show({ message: t(`users.notify.${done}`, { name }) });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('users.failed') }),
  });

  const confirmRole = (role: 'admin' | 'user') => {
    const key = role === 'admin' ? 'makeAdmin' : 'removeAdmin';
    modals.openConfirmModal({
      title: t(`users.${key}.confirm.title`, { name }),
      children: <Text size="sm">{t(`users.${key}.confirm.body`)}</Text>,
      labels: {
        confirm: t(`users.${key}.confirm.action`),
        cancel: common('action.cancel'),
      },
      confirmProps: role === 'user' ? { color: 'red' } : undefined,
      onConfirm: () =>
        change.mutate({
          run: () => authClient.admin.setRole({ userId, role }),
          done: role === 'admin' ? 'madeAdmin' : 'removedAdmin',
        }),
    });
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={t('users.actions.aria', { name })}
          >
            <IconDots size={18} stroke={1.75} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {isAdmin(user) ? (
            <Menu.Item
              leftSection={<IconShieldOff size={16} stroke={1.75} />}
              onClick={() => confirmRole('user')}
            >
              {t('users.actions.removeAdmin')}
            </Menu.Item>
          ) : (
            <Menu.Item
              leftSection={<IconShieldCheck size={16} stroke={1.75} />}
              onClick={() => confirmRole('admin')}
            >
              {t('users.actions.makeAdmin')}
            </Menu.Item>
          )}
          {user.banned ? (
            <Menu.Item
              leftSection={<IconCircleCheck size={16} stroke={1.75} />}
              onClick={() =>
                change.mutate({
                  run: () => authClient.admin.unbanUser({ userId }),
                  done: 'unbanned',
                })
              }
            >
              {t('users.actions.unban')}
            </Menu.Item>
          ) : (
            <Menu.Item
              color="red"
              leftSection={<IconBan size={16} stroke={1.75} />}
              onClick={() => setBanning(true)}
            >
              {t('users.actions.ban')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      <BanModal
        name={name}
        opened={banning}
        pending={change.isPending}
        onClose={() => setBanning(false)}
        onBan={({ seconds, reason }) =>
          change.mutate({
            run: () =>
              authClient.admin.banUser({
                userId,
                banReason: reason || undefined,
                banExpiresIn: seconds ?? undefined,
              }),
            done: 'banned',
          })
        }
      />
    </>
  );
}
