import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { isSessionNotFresh, SignInAgain } from '@/features/sign-in-again';
import { authClient, authError } from '@/shared/api';
import { hasPassword, linkedAccountsQuery } from '../api/linked-accounts';

// Better Auth wants the password, or for an account without one (Google) a
// session signed in within the day (isSessionNotFresh)
export function DeleteAccountModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(['account', 'auth']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useQuery(linkedAccountsQuery());
  const withPassword = !!accounts.data && hasPassword(accounts.data);
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { password: '' },
    validate: {
      password: (v) =>
        withPassword && !v ? t('delete.password.required') : null,
    },
  });
  const remove = useMutation({
    mutationFn: ({ password }: { password: string }) =>
      authClient.deleteUser(withPassword ? { password } : {}),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: '/sign-in', replace: true });
      notifications.show({ message: t('delete.notify.deleted') });
    },
    onError: (error) => {
      if (authError(error)?.code === 'INVALID_PASSWORD')
        form.setFieldError('password', t('auth:error.INVALID_PASSWORD'));
    },
  });
  const code = authError(remove.error)?.code;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('delete.confirm.title')}
      centered
    >
      <form
        noValidate
        onSubmit={form.onSubmit((values) => remove.mutate(values))}
      >
        <Stack gap="md">
          <Text size="sm">{t('delete.confirm.body')}</Text>
          {withPassword && (
            <PasswordInput
              label={t('delete.password.label')}
              autoComplete="current-password"
              data-autofocus
              key={form.key('password')}
              {...form.getInputProps('password')}
            />
          )}
          {remove.isError &&
            (isSessionNotFresh(remove.error) ? (
              <SignInAgain message={t('delete.freshSession')} />
            ) : (
              code !== 'INVALID_PASSWORD' && (
                <Alert color="red" role="alert">
                  {t('delete.failed')}
                </Alert>
              )
            ))}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose}>
              {t('delete.keep')}
            </Button>
            <Button
              color="red"
              type="submit"
              loading={remove.isPending || remove.isSuccess}
              disabled={accounts.isPending}
            >
              {t('delete.action')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
