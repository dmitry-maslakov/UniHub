import { Button, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { useSession, useSessionActions } from '@/entities/session';
import { AnchorLink, PageTitle } from '@/shared/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack component="section" gap="sm">
      <Title order={2}>{title}</Title>
      {children}
    </Stack>
  );
}

export function AccountPage() {
  const { user } = useSession();
  const { signOut } = useSessionActions();
  return (
    <>
      <PageTitle description={user.email}>{user.name}</PageTitle>
      <Stack gap="xxl">
        <Section title="API keys">
          <Text c="dimmed" maw="60ch">
            A key lets an AI agent, such as an MCP client, read your courses as
            you.
          </Text>
          <AnchorLink to="/settings/api-keys">Manage API keys</AnchorLink>
        </Section>
        <Section title="Another screen">
          <Text c="dimmed" maw="60ch">
            Signing in on a shared computer or a TV? Scan the QR code it shows
            with this phone, or type in its code.
          </Text>
          <AnchorLink to="/device">Enter a code</AnchorLink>
        </Section>
        <Section title="Sign out">
          <Text c="dimmed" maw="60ch">
            Signs this browser out. Your API keys keep working until you revoke
            them.
          </Text>
          <Button
            variant="default"
            w="fit-content"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </Section>
      </Stack>
    </>
  );
}
