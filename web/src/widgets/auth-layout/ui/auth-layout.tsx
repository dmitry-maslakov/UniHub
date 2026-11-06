import { Anchor, Box, Group } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ColorSchemeToggle } from '@/features/toggle-color-scheme';
import { Wordmark } from '@/shared/ui';

// Signing in and its kin: the name, light or dark, and one narrow form (or,
// for a page to read, a wider column), with the privacy policy below
export function AuthLayout({
  children,
  width = '25rem',
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <Box mih="100dvh">
      <Group component="header" justify="space-between" h={64} px="lg">
        <Wordmark />
        <ColorSchemeToggle />
      </Group>
      <Box
        component="main"
        maw={width}
        mx="auto"
        px="md"
        pt={{ base: 'xl', sm: '8vh' }}
        pb="xl"
      >
        {children}
      </Box>
      <Box component="footer" ta="center" pb="xl">
        <Anchor component={Link} to="/privacy" size="sm" c="dimmed">
          Privacy
        </Anchor>
      </Box>
    </Box>
  );
}
