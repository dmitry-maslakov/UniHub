import { Alert, Button, PasswordInput, Stack, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { AnchorLink } from '@/shared/ui';
import { signUpSchema } from '../model/schema';

const taken = ['USER_ALREADY_EXISTS', 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'];

export function SignUpForm({ next }: { next: string }) {
  const { t } = useTranslation('auth');
  const schema = useMemo(() => signUpSchema(t), [t]);
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof schema>>({
    mode: 'uncontrolled',
    initialValues: { name: '', email: '', password: '' },
    validate: schemaResolver(schema, { sync: true }),
  });
  const signUp = useMutation({
    // the link in the confirmation mail signs in and goes on to `next`
    mutationFn: (values: z.infer<typeof schema>) =>
      authClient.signUp.email({ ...values, callbackURL: next }),
    onSuccess: (_, { email }) =>
      navigate({ to: '/check-email', search: { email, next } }),
  });
  const error = authError(signUp.error);

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) => signUp.mutate(values))}
    >
      <Stack gap="md">
        {signUp.isError && (
          <Alert color="red" role="alert">
            {authMessage(error, t('signUp.failed'))}{' '}
            {error?.code && taken.includes(error.code) && (
              <AnchorLink to="/sign-in" search={{ next }} size="sm" inherit>
                {t('signUp.signInInstead')}
              </AnchorLink>
            )}
          </Alert>
        )}
        <TextInput
          label={t('signUp.name.label')}
          autoComplete="name"
          key={form.key('name')}
          {...form.getInputProps('name')}
        />
        <TextInput
          label={t('signUp.email.label')}
          type="email"
          autoComplete="email"
          description={t('signUp.email.help')}
          key={form.key('email')}
          {...form.getInputProps('email')}
        />
        <PasswordInput
          label={t('signUp.password.label')}
          autoComplete="new-password"
          description={t('signUp.password.help')}
          key={form.key('password')}
          {...form.getInputProps('password')}
        />
        <Button type="submit" fullWidth loading={signUp.isPending}>
          {t('signUp.action')}
        </Button>
      </Stack>
    </form>
  );
}
