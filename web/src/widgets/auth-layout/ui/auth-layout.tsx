import { Box, Group } from '@mantine/core';
import type { ReactNode } from 'react';
import { ColorSchemeToggle } from '@/features/toggle-color-scheme';
import { Wordmark } from '@/shared/ui';

// Signing in and its kin: the name, light or dark, and one narrow form
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box mih="100dvh">
      <Group component="header" justify="space-between" h={64} px="lg">
        <Wordmark />
        <ColorSchemeToggle />
      </Group>
      <Box
        component="main"
        maw="25rem"
        mx="auto"
        px="md"
        pt={{ base: 'xl', sm: '8vh' }}
        pb="xxl"
      >
        {children}
      </Box>
    </Box>
  );
}
