import { Anchor, Box, Group } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '@/features/switch-language';
import { ColorSchemeToggle } from '@/features/toggle-color-scheme';
import { Wordmark } from '@/shared/ui';

// Signing in and its kin: the name, language and light or dark, and one
// narrow form (or, for a page to read, a wider column), with the privacy
// policy below. Its header is as wide as the app's.
export function AuthLayout({
  children,
  width = '25rem',
}: {
  children: ReactNode;
  width?: string;
}) {
  const { t } = useTranslation('shell');
  return (
    <Box mih="100dvh">
      <Group
        component="header"
        justify="space-between"
        h={64}
        maw="60rem"
        mx="auto"
        px="md"
      >
        <Wordmark />
        <Group gap="xs" wrap="nowrap">
          <LanguageSwitch />
          <ColorSchemeToggle />
        </Group>
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
          {t('footer.privacy')}
        </Anchor>
      </Box>
    </Box>
  );
}
