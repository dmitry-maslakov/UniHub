import { Stack, Title } from '@mantine/core';
import type { ReactNode } from 'react';

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack component="section" gap="xs">
      <Title order={2} fz="lg">
        {title}
      </Title>
      {children}
    </Stack>
  );
}
