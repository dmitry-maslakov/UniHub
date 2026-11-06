import { Text } from '@mantine/core';
import { AnchorLink, PageTitle } from '@/shared/ui';

// Where an AI app's request to connect will be approved; until then, keys
export function ConsentPage() {
  return (
    <>
      <PageTitle>Connect an app</PageTitle>
      <Text c="dimmed" maw="60ch" mb="md">
        Approving AI apps that ask to read your courses isn't available yet.
        Until it is, give an agent an API key.
      </Text>
      <AnchorLink to="/settings/api-keys">Manage API keys</AnchorLink>
    </>
  );
}
