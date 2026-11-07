import { Alert, Box, Button, Group, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isSessionNotFresh, SignInAgain } from '@/features/sign-in-again';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { apiKeys } from '../api/api-keys';

// Names and makes a key, handing it up to be shown once
export function CreateKeyForm({
  onCreated,
}: {
  onCreated: (key: { id: string; key: string }) => void;
}) {
  const { t } = useTranslation('connect');
  const queryClient = useQueryClient();
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { name: '' },
    validate: {
      name: (v) => (v.trim() ? null : t('keys.new.required')),
    },
  });
  const create = useMutation({
    mutationFn: (name: string) => authClient.apiKey.create({ name }),
    onSuccess: async ({ id, key }) => {
      form.reset();
      onCreated({ id, key });
      await queryClient.invalidateQueries(apiKeys());
    },
  });

  return (
    <form
      noValidate
      onSubmit={form.onSubmit(({ name }) => create.mutate(name.trim()))}
    >
      <Group align="flex-end" gap="sm" wrap="wrap">
        <TextInput
          label={t('keys.new.label')}
          placeholder={t('keys.new.placeholder')}
          style={{ flex: '1 1 16rem' }}
          key={form.key('name')}
          {...form.getInputProps('name')}
        />
        <Button type="submit" loading={create.isPending}>
          {t('keys.new.action')}
        </Button>
      </Group>
      {create.isError &&
        (isSessionNotFresh(create.error) ? (
          <Box mt="md">
            <SignInAgain message={t('keys.freshSession')} />
          </Box>
        ) : (
          <Alert color="red" role="alert" mt="md">
            {authMessage(authError(create.error), t('keys.new.failed'))}
          </Alert>
        ))}
    </form>
  );
}
