import { Alert, Button, PasswordInput, Stack } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { z } from 'zod';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { newPasswordSchema } from '../model/schema';

// Sets the new password. Better Auth signs out every session and the hub
// drops the user's API keys with it, so they sign in afresh.
export function NewPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof newPasswordSchema>>({
    mode: 'uncontrolled',
    initialValues: { password: '', confirm: '' },
    validate: schemaResolver(newPasswordSchema, { sync: true }),
  });
  const reset = useMutation({
    mutationFn: ({ password }: z.infer<typeof newPasswordSchema>) =>
      authClient.resetPassword({ newPassword: password, token }),
    onSuccess: async () => {
      notifications.show({
        title: 'Password changed',
        message: 'Sign in with your new password.',
      });
      await navigate({ to: '/sign-in' });
    },
  });

  return (
    <form noValidate onSubmit={form.onSubmit((values) => reset.mutate(values))}>
      <Stack gap="md">
        {reset.isError && (
          <Alert color="red" role="alert">
            {authMessage(
              authError(reset.error),
              "Couldn't change your password. Try again.",
            )}
          </Alert>
        )}
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          description="At least 8 characters."
          key={form.key('password')}
          {...form.getInputProps('password')}
        />
        <PasswordInput
          label="New password again"
          autoComplete="new-password"
          key={form.key('confirm')}
          {...form.getInputProps('confirm')}
        />
        <Button
          type="submit"
          fullWidth
          loading={reset.isPending || reset.isSuccess}
        >
          Change password
        </Button>
      </Stack>
    </form>
  );
}
