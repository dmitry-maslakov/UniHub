import {
  Alert,
  Button,
  Group,
  PasswordInput,
  Stack,
  TextInput,
} from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { z } from 'zod';
import { useSessionActions } from '@/entities/session';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { signInSchema } from '../model/schema';
import { ConfirmEmailFirst } from './confirm-email-first';
import { AnchorLink } from '@/shared/ui';

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const { refresh } = useSessionActions();
  const form = useForm<z.infer<typeof signInSchema>>({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '' },
    validate: schemaResolver(signInSchema, { sync: true }),
  });
  const signIn = useMutation({
    mutationFn: (values: z.infer<typeof signInSchema>) =>
      authClient.signIn.email(values),
    onSuccess: async (data) => {
      // an OAuth client's sign-in: Better Auth's client goes on to it
      if (data.redirect) return;
      await refresh();
      await router.navigate({ href: next });
    },
  });
  const error = authError(signIn.error);

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) => signIn.mutate(values))}
    >
      <Stack gap="md">
        {error?.code === 'EMAIL_NOT_VERIFIED' ? (
          <ConfirmEmailFirst email={form.getValues().email} next={next} />
        ) : (
          signIn.isError && (
            <Alert color="red" role="alert">
              {authMessage(error, "Couldn't sign you in. Try again.")}
            </Alert>
          )
        )}
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          key={form.key('email')}
          {...form.getInputProps('email')}
        />
        <Stack gap={6}>
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            key={form.key('password')}
            {...form.getInputProps('password')}
          />
          <Group justify="flex-end">
            <AnchorLink to="/reset-password" size="sm">
              Forgot your password?
            </AnchorLink>
          </Group>
        </Stack>
        <Button
          type="submit"
          fullWidth
          loading={signIn.isPending || signIn.isSuccess}
        >
          Sign in
        </Button>
      </Stack>
    </form>
  );
}
