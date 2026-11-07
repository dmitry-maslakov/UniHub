import { Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

// Nothing here yet: what will fill it, or what to do, in words and at most
// one action
export function EmptyState({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack gap="xs" py="lg" maw="60ch" align="flex-start">
      <Text fw={600}>{title}</Text>
      {children && (
        <Text size="sm" c="dimmed">
          {children}
        </Text>
      )}
      {action}
    </Stack>
  );
}
