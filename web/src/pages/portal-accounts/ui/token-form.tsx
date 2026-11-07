import { Alert, Box, Button, Group, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { isSessionNotFresh, SignInAgain } from '@/features/sign-in-again';
import { ApiError } from '@/shared/api';
import { putToken } from '../api/portals';
import { tokenErrorText } from '../lib/token-error';

// Links a portal account by the user's own token, or replaces it. Write-only:
// the field is uncontrolled and emptied the moment it's sent, whatever comes
// back, so a refused token is typed again rather than kept anywhere.
// `onUnavailable` for a portal that links no account of this user's.
export function TokenForm({
  portal,
  label,
  linked,
  onUnavailable,
}: {
  portal: string;
  // the name the portal is shown by
  label: string;
  linked: boolean;
  onUnavailable: () => void;
}) {
  const queryClient = useQueryClient();
  const field = useRef<HTMLInputElement>(null);
  // from the field to the request, never through the mutation's variables
  const pending = useRef('');
  const [empty, setEmpty] = useState(false);
  const link = useMutation({
    mutationFn: () => {
      const token = pending.current;
      pending.current = '';
      return putToken(portal, token);
    },
    onSuccess: async () => {
      notifications.show({
        message: `${label} is linked. Its courses appear after the next read.`,
      });
      await queryClient.invalidateQueries({
        queryKey: ['get', '/api/me/portals'],
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) onUnavailable();
    },
  });

  const submit = () => {
    const token = field.current?.value.trim() ?? '';
    if (field.current) field.current.value = '';
    setEmpty(!token);
    pending.current = token;
    if (token) link.mutate();
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Group align="flex-end" gap="sm" wrap="wrap">
        <TextInput
          ref={field}
          type="password"
          label={linked ? 'New token' : 'Token'}
          description="The access token the portal gave you. It's sent once and never shown again."
          autoComplete="new-password"
          spellCheck={false}
          error={empty ? 'Paste your token first' : undefined}
          style={{ flex: '1 1 16rem' }}
          onChange={() => empty && setEmpty(false)}
        />
        <Button type="submit" loading={link.isPending}>
          {linked ? 'Replace token' : 'Link account'}
        </Button>
      </Group>
      {link.isError &&
        (isSessionNotFresh(link.error) ? (
          <Box mt="md">
            <SignInAgain action="link a portal account" />
          </Box>
        ) : link.error instanceof ApiError &&
          link.error.status === 404 ? null : (
          <Alert color="red" role="alert" mt="md">
            {tokenErrorText(link.error)}
          </Alert>
        ))}
    </form>
  );
}
