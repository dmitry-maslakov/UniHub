import { Stack, Title } from '@mantine/core';
import { useState } from 'react';
import { PageTitle } from '@/shared/ui';
import { CreateKeyForm } from './create-key-form';
import { KeyList } from './key-list';
import { NewKey } from './new-key';

export function ApiKeysPage() {
  const [created, setCreated] = useState<{ id: string; key: string }>();
  return (
    <>
      <PageTitle description="A key lets an AI agent, such as an MCP client, read your courses as you. Keys expire after 90 days, and changing your password revokes them all.">
        API keys
      </PageTitle>
      <Stack gap="xxl">
        <Stack gap="lg">
          <CreateKeyForm onCreated={setCreated} />
          {created && (
            <NewKey value={created.key} onDone={() => setCreated(undefined)} />
          )}
        </Stack>
        <Stack component="section" gap="xs">
          <Title order={2}>Your keys</Title>
          <KeyList
            onRevoked={(id) =>
              setCreated((shown) => (shown?.id === id ? undefined : shown))
            }
          />
        </Stack>
      </Stack>
    </>
  );
}
