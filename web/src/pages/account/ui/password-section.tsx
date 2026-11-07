import { Alert, Button, PasswordInput, Stack, Text } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useSessionActions } from '@/entities/session';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { QueryState, Section, TextSkeleton } from '@/shared/ui';
import { hasPassword, linkedAccountsQuery } from '../api/linked-accounts';
import { passwordSchema } from '../model/schema';

// Changing the password, for an account that has one. The hub ends what the
// old password let in: API keys and connected apps, and the other devices.
export function PasswordSection() {
  const { t } = useTranslation(['account', 'auth', 'common']);
  const queryClient = useQueryClient();
  const { refresh } = useSessionActions();
  const accounts = useQuery(linkedAccountsQuery());
  const schema = useMemo(() => passwordSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    mode: 'uncontrolled',
    initialValues: { current: '', next: '', confirm: '' },
    validate: schemaResolver(schema, { sync: true }),
  });
  const change = useMutation({
    mutationFn: ({ current, next }: z.infer<typeof schema>) =>
      authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      }),
    onSuccess: async () => {
      form.reset();
      notifications.show({ message: t('password.notify.changed') });
      // this device has a session of its own now
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['auth', 'connected-apps'] }),
        queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
      ]);
    },
    onError: (error) => {
      if (authError(error)?.code === 'INVALID_PASSWORD')
        form.setFieldError('current', t('auth:error.INVALID_PASSWORD'));
    },
  });
  const error = authError(change.error);

  return (
    <Section
      title={t('password.title')}
      description={t('password.description')}
    >
      <QueryState
        query={accounts}
        loading={<TextSkeleton lines={2} label={t('common:state.loading')} />}
      >
        {(data) =>
          hasPassword(data) ? (
            <form
              noValidate
              onSubmit={form.onSubmit((values) => change.mutate(values))}
            >
              <Stack gap="md">
                {change.isError && error?.code !== 'INVALID_PASSWORD' && (
                  <Alert color="red" role="alert">
                    {authMessage(error, t('password.failed'))}
                  </Alert>
                )}
                <PasswordInput
                  label={t('password.current.label')}
                  autoComplete="current-password"
                  key={form.key('current')}
                  {...form.getInputProps('current')}
                />
                <PasswordInput
                  label={t('password.next.label')}
                  description={t('password.next.help')}
                  autoComplete="new-password"
                  key={form.key('next')}
                  {...form.getInputProps('next')}
                />
                <PasswordInput
                  label={t('password.confirm.label')}
                  autoComplete="new-password"
                  key={form.key('confirm')}
                  {...form.getInputProps('confirm')}
                />
                <Button
                  variant="default"
                  type="submit"
                  w="fit-content"
                  loading={change.isPending}
                >
                  {t('password.action')}
                </Button>
              </Stack>
            </form>
          ) : (
            <Text c="dimmed">{t('password.none')}</Text>
          )
        }
      </QueryState>
    </Section>
  );
}
