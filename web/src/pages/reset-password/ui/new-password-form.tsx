import { Alert, Button, PasswordInput, Stack } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useSessionActions } from '@/entities/session';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { newPasswordSchema } from '../model/schema';

// Sets the new password. Better Auth signs out every session and the hub
// drops the user's API keys with it, so they sign in afresh.
export function NewPasswordForm({ token }: { token: string }) {
  const { t } = useTranslation('auth');
  const schema = useMemo(() => newPasswordSchema(t), [t]);
  const navigate = useNavigate();
  const { refresh } = useSessionActions();
  const form = useForm<z.infer<typeof schema>>({
    mode: 'uncontrolled',
    initialValues: { password: '', confirm: '' },
    validate: schemaResolver(schema, { sync: true }),
  });
  const reset = useMutation({
    mutationFn: ({ password }: z.infer<typeof schema>) =>
      authClient.resetPassword({ newPassword: password, token }),
    onSuccess: async () => {
      // every session ended with it, this browser's too
      await refresh();
      notifications.show({
        title: t('newPassword.notify.title'),
        message: t('newPassword.notify.body'),
      });
      await navigate({ to: '/sign-in' });
    },
  });

  return (
    <form noValidate onSubmit={form.onSubmit((values) => reset.mutate(values))}>
      <Stack gap="md">
        {reset.isError && (
          <Alert color="red" role="alert">
            {authMessage(authError(reset.error), t('newPassword.failed'))}
          </Alert>
        )}
        <PasswordInput
          label={t('newPassword.label')}
          autoComplete="new-password"
          description={t('newPassword.help')}
          key={form.key('password')}
          {...form.getInputProps('password')}
        />
        <PasswordInput
          label={t('newPassword.confirm')}
          autoComplete="new-password"
          key={form.key('confirm')}
          {...form.getInputProps('confirm')}
        />
        <Button
          type="submit"
          fullWidth
          loading={reset.isPending || reset.isSuccess}
        >
          {t('newPassword.action')}
        </Button>
      </Stack>
    </form>
  );
}
