import { Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

// Nothing here yet: what will fill it, or what to do, in words and at most
// one action; `icon` before the title says something is under way
export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const heading = <Text fw={600}>{title}</Text>;
  return (
    <Stack gap="xs" py="lg" maw="60ch" align="flex-start">
      {icon ? (
        <Group gap="xs" wrap="nowrap">
          {icon}
          {heading}
        </Group>
      ) : (
        heading
      )}
      {children && (
        <Text size="sm" c="dimmed">
          {children}
        </Text>
      )}
      {action}
    </Stack>
  );
}
