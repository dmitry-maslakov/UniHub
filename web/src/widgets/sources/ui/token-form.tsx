import {
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { isSessionNotFresh, SignInAgain } from '@/features/sign-in-again';
import { ApiError, type Schemas } from '@/shared/api';
import { putToken } from '../api/portals';
import { SITE_PLACEHOLDER, siteOf, tokenPageOf } from '../lib/site';
import { tokenErrorText } from '../lib/token-error';

// Links a source's account by the user's own token, or replaces it; on a
// site per school (`site`), with the school's address, which also says
// where the token is made. Write-only: the token field is uncontrolled and
// emptied the moment it's sent, whatever comes back, so a refused token is
// typed again rather than kept anywhere; one not sent for an address that
// can't be right stays, as the school's Canvas shows a new one only once.
// `onUnavailable` for a source that links no account of this user's.
export function TokenForm({
  portal: { portal, label, linked, instance },
  site,
  onUnavailable,
}: {
  portal: Schemas['PortalResponse'];
  site: boolean;
  onUnavailable: () => void;
}) {
  const { t } = useTranslation('sources');
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
      notifications.show({ message: t('notify.linked', { label }) });
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
    setTried(true);
    setEmpty(!token);
    if (!token || (site && !school)) return;
    if (field.current) field.current.value = '';
    pending.current = token;
    link.mutate(site ? school! : undefined);
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
            label={t('site.label', { label })}
            description={t('site.help', { label })}
            placeholder={SITE_PLACEHOLDER}
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            error={tried && !school ? t('site.invalid', { label }) : undefined}
          />
        )}
        {site && (
          <Text size="sm" c="dimmed">
            <Trans
              t={t}
              i18nKey="site.tokenHelp"
              values={{ label }}
              components={{
                anchor: school ? (
                  <Anchor
                    href={tokenPageOf(school)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('site.getTokenAria', { label })}
                  />
                ) : (
                  <span />
                ),
              }}
            />
          </Text>
        )}
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            ref={field}
            type="password"
            label={t(linked ? 'token.newLabel' : 'token.label')}
            description={t('token.help', { label })}
            autoComplete="new-password"
            spellCheck={false}
            error={empty ? t('token.empty') : undefined}
            // under the school's address, the token is as wide and the
            // button goes under it; alone, the button sits beside it
            style={{ flex: site ? '1 1 100%' : '1 1 16rem' }}
            onChange={() => empty && setEmpty(false)}
          />
          <Button type="submit" loading={link.isPending}>
            {linked ? t('replace') : t('link', { label })}
          </Button>
        </Group>
      </Stack>
      {link.isError &&
        (isSessionNotFresh(link.error) ? (
          <Box mt="md">
            <SignInAgain message={t('freshSession', { label })} />
          </Box>
        ) : link.error instanceof ApiError &&
          link.error.status === 404 ? null : (
          <Alert color="red" role="alert" mt="md">
            {tokenErrorText(t, link.error, { label, site })}
          </Alert>
        ))}
    </form>
  );
}
