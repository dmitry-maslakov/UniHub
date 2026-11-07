import { Alert, Anchor, List, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSession, useSessionActions } from '@/entities/session';
import { PageTitle, Section } from '@/shared/ui';
import { publicClient } from '../api/consent';
import type { ConsentRequest } from '../lib/request';
import { ConsentDecision } from './consent-decision';

// Who asks, what they'd be able to do, and where the user returns to
export function ConsentRequestView({ request }: { request: ConsentRequest }) {
  const { t } = useTranslation('consent');
  const { user } = useSession();
  const { signOut } = useSessionActions();
  const here = useRouterState({ select: (s) => s.location.href });
  const [leaving, setLeaving] = useState(false);
  const client = useQuery(publicClient(request.clientId));

  return (
    <>
      <PageTitle
        description={
          client.data?.name
            ? t('named', { name: client.data.name })
            : t('unnamed')
        }
      >
        {t('title', { requester: request.requester })}
      </PageTitle>
      <Stack gap="xl">
        <Section title={t('can.title')}>
          <List spacing={4}>
            <List.Item>{t('can.read')}</List.Item>
            {request.staysConnected && <List.Item>{t('can.stay')}</List.Item>}
          </List>
          {!request.staysConnected && <Text>{t('hourOnly')}</Text>}
        </Section>
        <Text>
          <Trans
            t={t}
            i18nKey="returnTo"
            values={{ host: request.returnTo }}
            components={{ strong: <strong /> }}
          />
          {request.insecure && ` ${t('notEncrypted')}`}
        </Text>
        {request.loopback && (
          <Alert
            color="red"
            role="alert"
            icon={<IconAlertTriangle size={20} stroke={1.75} />}
            title={t('loopback.title')}
          >
            {t('loopback.body')}
          </Alert>
        )}
        <ConsentDecision />
        <Text size="sm" c="dimmed">
          {t('signedInAs', { email: user.email })}{' '}
          <Anchor
            component="button"
            type="button"
            size="sm"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void signOut(here);
            }}
          >
            {t('notYou')}
          </Anchor>
        </Text>
      </Stack>
    </>
  );
}
