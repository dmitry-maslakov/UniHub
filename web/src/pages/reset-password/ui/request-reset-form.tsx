import { Alert, Button, Stack, Text, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import type { z } from 'zod';
import { authClient, authError } from '@/shared/api';
import { authMessage } from '@/shared/lib';
import { requestResetSchema } from '../model/schema';
import { AnchorLink } from '@/shared/ui';

// Asks for a link by mail; Better Auth answers the same whether or not the
// email has an account, and so does this
export function RequestResetForm() {
  const form = useForm<z.infer<typeof requestResetSchema>>({
    mode: 'uncontrolled',
    initialValues: { email: '' },
    validate: schemaResolver(requestResetSchema, { sync: true }),
  });
  const request = useMutation({
    mutationFn: ({ email }: z.infer<typeof requestResetSchema>) =>
      authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }),
  });

  if (request.isSuccess)
    return (
      <Stack gap="lg">
        <Text>
          If there's an account for <strong>{request.variables.email}</strong>,
          a link to reset its password is on its way. It works for an hour.
        </Text>
        <AnchorLink to="/sign-in">Back to sign in</AnchorLink>
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
            {authMessage(
              authError(request.error),
              "Couldn't send the link. Try again.",
            )}
          </Alert>
        )}
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          key={form.key('email')}
          {...form.getInputProps('email')}
        />
        <Button type="submit" fullWidth loading={request.isPending}>
          Send reset link
        </Button>
        <AnchorLink to="/sign-in" size="sm" ta="center">
          Back to sign in
        </AnchorLink>
      </Stack>
    </form>
  );
}
