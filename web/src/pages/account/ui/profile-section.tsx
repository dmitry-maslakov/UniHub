import { Alert, Button, Group, Text, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useSession, useSessionActions } from '@/entities/session';
import { authClient } from '@/shared/api';
import { Section } from '@/shared/ui';
import { profileSchema } from '../model/schema';

// The name shown to the user and to others; the email is read-only
export function ProfileSection() {
  const { t } = useTranslation('account');
  const { user } = useSession();
  const { refresh } = useSessionActions();
  const schema = useMemo(() => profileSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    mode: 'uncontrolled',
    initialValues: { name: user.name },
    validate: schemaResolver(schema, { sync: true }),
  });
  const save = useMutation({
    mutationFn: ({ name }: z.infer<typeof schema>) =>
      authClient.updateUser({ name }),
    onSuccess: async (_, { name }) => {
      await refresh();
      form.setValues({ name });
      notifications.show({ message: t('profile.notify.saved') });
    },
  });

  return (
    <Section title={t('profile.title')}>
      <form
        noValidate
        onSubmit={form.onSubmit((values) =>
          save.mutate({ name: values.name.trim() }),
        )}
      >
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            label={t('profile.name.label')}
            autoComplete="name"
            style={{ flex: '1 1 16rem' }}
            key={form.key('name')}
            {...form.getInputProps('name')}
          />
          <Button variant="default" type="submit" loading={save.isPending}>
            {t('profile.save')}
          </Button>
        </Group>
        {save.isError && (
          <Alert color="red" role="alert" mt="md">
            {t('profile.failed')}
          </Alert>
        )}
      </form>
      <Text size="sm" c="dimmed">
        {t('profile.email', { email: user.email })}
      </Text>
    </Section>
  );
}
