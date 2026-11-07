import { Alert, Button, Stack, Text, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { AnchorLink } from '@/shared/ui';
import { requestResetSchema } from '../model/schema';

// Asks for a link by mail; Better Auth answers the same whether or not the
// email has an account, and so does this
export function RequestResetForm() {
  const { t } = useTranslation('auth');
  const schema = useMemo(() => requestResetSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    mode: 'uncontrolled',
    initialValues: { email: '' },
    validate: schemaResolver(schema, { sync: true }),
  });
  const request = useMutation({
    mutationFn: ({ email }: z.infer<typeof schema>) =>
      authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }),
  });

  if (request.isSuccess)
    return (
      <Stack gap="lg">
        <Text>
          <Trans
            t={t}
            i18nKey="reset.sent"
            values={{ email: request.variables.email }}
            components={{ strong: <strong /> }}
          />
        </Text>
        <AnchorLink to="/sign-in">{t('reset.back')}</AnchorLink>
      </Stack>
    );

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) => request.mutate(values))}
    >
      <Stack gap="md">
        {request.isError && (
          <Alert color="red" role="alert">
            {authMessage(authError(request.error), t('reset.failed'))}
          </Alert>
        )}
        <TextInput
          label={t('signIn.email.label')}
          type="email"
          autoComplete="email"
          key={form.key('email')}
          {...form.getInputProps('email')}
        />
        <Button type="submit" fullWidth loading={request.isPending}>
          {t('reset.action')}
        </Button>
        <AnchorLink to="/sign-in" size="sm" ta="center">
          {t('reset.back')}
        </AnchorLink>
      </Stack>
    </form>
  );
}
