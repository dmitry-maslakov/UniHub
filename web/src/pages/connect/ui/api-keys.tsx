import { Stack } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Section } from '@/shared/ui';
import { CreateKeyForm } from './create-key-form';
import { KeyList } from './key-list';
import { NewKey } from './new-key';

// For an app that can't sign in by itself: a key, made and revoked here
export function ApiKeys() {
  const { t } = useTranslation('connect');
  const [created, setCreated] = useState<{ id: string; key: string }>();
  return (
    <Section title={t('keys.title')} description={t('keys.description')}>
      <Stack gap="lg">
        <CreateKeyForm onCreated={setCreated} />
        {created && (
          <NewKey value={created.key} onDone={() => setCreated(undefined)} />
        )}
        <KeyList
          onRevoked={(id) =>
            setCreated((shown) => (shown?.id === id ? undefined : shown))
          }
        />
      </Stack>
    </Section>
  );
}
