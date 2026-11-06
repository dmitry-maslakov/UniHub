import { Alert, Button, PasswordInput, Stack, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { z } from 'zod';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { signUpSchema } from '../model/schema';
import { AnchorLink } from '@/shared/ui';

const taken = ['USER_ALREADY_EXISTS', 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'];

export function SignUpForm({ next }: { next: string }) {
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof signUpSchema>>({
    mode: 'uncontrolled',
    initialValues: { name: '', email: '', password: '' },
    validate: schemaResolver(signUpSchema, { sync: true }),
  });
  const signUp = useMutation({
    // the link in the confirmation mail signs in and goes on to `next`
    mutationFn: (values: z.infer<typeof signUpSchema>) =>
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
            {authMessage(error, "Couldn't create your account. Try again.")}{' '}
            {error?.code && taken.includes(error.code) && (
              <AnchorLink to="/sign-in" search={{ next }} size="sm" inherit>
                Sign in instead
              </AnchorLink>
            )}
          </Alert>
        )}
        <TextInput
          label="Name"
          autoComplete="name"
          key={form.key('name')}
          {...form.getInputProps('name')}
        />
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          description="We'll send a link to confirm it."
          key={form.key('email')}
          {...form.getInputProps('email')}
        />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          description="At least 8 characters."
          key={form.key('password')}
          {...form.getInputProps('password')}
        />
        <Button type="submit" fullWidth loading={signUp.isPending}>
          Create account
        </Button>
      </Stack>
    </form>
  );
}
