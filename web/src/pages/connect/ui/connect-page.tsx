import { Stack } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageTitle, Section } from '@/shared/ui';
import { CreateKeyForm } from './create-key-form';
import { KeyList } from './key-list';
import { NewKey } from './new-key';

// How an AI app gets in: for now by an API key, made and revoked here
export function ConnectPage() {
  const { t } = useTranslation('connect');
  const [created, setCreated] = useState<{ id: string; key: string }>();
  return (
    <>
      <PageTitle description={t('description')}>{t('title')}</PageTitle>
      <Stack gap="xxl">
        <Section title={t('keys.title')} description={t('keys.description')}>
          <Stack gap="lg">
            <CreateKeyForm onCreated={setCreated} />
            {created && (
              <NewKey
                value={created.key}
                onDone={() => setCreated(undefined)}
              />
            )}
            <KeyList
              onRevoked={(id) =>
                setCreated((shown) => (shown?.id === id ? undefined : shown))
              }
            />
          </Stack>
        </Section>
      </Stack>
    </>
  );
}
