import { Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

// A page's one heading, and what the page is for under it
export function PageTitle({
  children,
  description,
}: {
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Stack gap="xs" mb="xl">
      <Title order={1} style={{ overflowWrap: 'anywhere' }}>
        {children}
      </Title>
      {description && (
        <Text c="dimmed" maw="60ch" style={{ overflowWrap: 'anywhere' }}>
          {description}
        </Text>
      )}
    </Stack>
  );
}
