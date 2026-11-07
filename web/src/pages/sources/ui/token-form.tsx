import {
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { isSessionNotFresh, SignInAgain } from '@/features/sign-in-again';
import { ApiError, type Schemas } from '@/shared/api';
import { putToken } from '../api/portals';
import { siteOf, tokenPageOf } from '../lib/site';
import { tokenErrorText } from '../lib/token-error';

// Links a source's account by the user's own token, or replaces it; on a
// site per school (`site`), with the school's address, which also says
// where the token is made. Write-only: the token field is uncontrolled and
// emptied the moment it's sent, whatever comes back, so a refused token is
// typed again rather than kept anywhere. `onUnavailable` for a source that
// links no account of this user's.
export function TokenForm({
  portal: { portal, label, linked, instance },
  site,
  onUnavailable,
}: {
  portal: Schemas['PortalResponse'];
  site: boolean;
  onUnavailable: () => void;
}) {
  const queryClient = useQueryClient();
  const field = useRef<HTMLInputElement>(null);
  // from the field to the request, never through the mutation's variables
  const pending = useRef('');
  const [address, setAddress] = useState(instance ?? '');
  const [tried, setTried] = useState(false);
  const [empty, setEmpty] = useState(false);
  const school = siteOf(address);
  const link = useMutation({
    mutationFn: (url: string | undefined) => {
      const token = pending.current;
      pending.current = '';
      return putToken(portal, token, url);
    },
    onSuccess: async () => {
      notifications.show({
        message: `${label} is linked. Its courses show up after the next read.`,
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
    setTried(true);
    setEmpty(!token);
    pending.current = token;
    if (token && (!site || school)) link.mutate(site ? school! : undefined);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack gap="md">
        {site && (
          <TextInput
            label={`Your school's ${label}`}
            description={`The address you open ${label} at.`}
            placeholder="https://canvas.example.edu"
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            error={
              tried && !school
                ? `Enter the address you open ${label} at, starting with https://`
                : undefined
            }
          />
        )}
        {site && (
          <Text size="sm" c="dimmed">
            {school ? (
              <Anchor
                href={tokenPageOf(school)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get a token
                <VisuallyHidden> (opens {label} in a new tab)</VisuallyHidden>
              </Anchor>
            ) : (
              'Get a token'
            )}{' '}
            on your {label}’s Settings page: New access token, with a purpose
            and an expiry date.
          </Text>
        )}
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            ref={field}
            type="password"
            label={linked ? 'New token' : 'Token'}
            description={`The access token ${label} gave you. It's sent once and never shown again.`}
            autoComplete="new-password"
            spellCheck={false}
            error={empty ? 'Paste your token first' : undefined}
            // under the school's address, the token is as wide and the
            // button goes under it; alone, the button sits beside it
            style={{ flex: site ? '1 1 100%' : '1 1 16rem' }}
            onChange={() => empty && setEmpty(false)}
          />
          <Button type="submit" loading={link.isPending}>
            {linked ? 'Replace token' : `Link ${label}`}
          </Button>
        </Group>
      </Stack>
      {link.isError &&
        (isSessionNotFresh(link.error) ? (
          <Box mt="md">
            <SignInAgain action={`link ${label}`} />
          </Box>
        ) : link.error instanceof ApiError &&
          link.error.status === 404 ? null : (
          <Alert color="red" role="alert" mt="md">
            {tokenErrorText(link.error, { label, site })}
          </Alert>
        ))}
    </form>
  );
}
