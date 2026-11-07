import { Anchor, Avatar, Box, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconLock, IconLogout, IconUser } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession, useSessionActions } from '@/entities/session';
import { ColorSchemeMenuItems } from '@/features/toggle-color-scheme';
import { LanguageMenuItems } from '@/features/switch-language';

// the commit this build is of; unset in development
const version: string = import.meta.env.VITE_COMMIT_SHA ?? 'dev';
const isCommit = /^[0-9a-f]{7,40}$/.test(version);

// What is the user's rather than the app's: who they are, their account,
// how the app looks and speaks, the privacy policy, signing out
export function UserMenu() {
  const { t } = useTranslation('shell');
  const { user } = useSession();
  const { signOut } = useSessionActions();
  const label = t('userMenu.version', { version: version.slice(0, 7) });
  return (
    <Menu position="bottom-end" width={260} offset={8}>
      <Menu.Target>
        <UnstyledButton aria-label={t('userMenu.open', { name: user.name })}>
          <Avatar name={user.name} color="petrol" size={34} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Box px="sm" py="xs">
          <Text size="sm" fw={600} truncate>
            {user.name}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {user.email}
          </Text>
        </Box>
        <Menu.Divider />
        <Menu.Item
          component={Link}
          to="/account"
          leftSection={<IconUser size={16} stroke={1.75} />}
        >
          {t('userMenu.account')}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>{t('userMenu.theme')}</Menu.Label>
        <ColorSchemeMenuItems />
        <Menu.Label>{t('userMenu.language')}</Menu.Label>
        <LanguageMenuItems />
        <Menu.Divider />
        <Menu.Item
          component={Link}
          to="/privacy"
          leftSection={<IconLock size={16} stroke={1.75} />}
        >
          {t('userMenu.privacy')}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconLogout size={16} stroke={1.75} />}
          onClick={() => void signOut()}
        >
          {t('userMenu.signOut')}
        </Menu.Item>
        <Menu.Divider />
        <Box px="sm" py={4}>
          {isCommit ? (
            <Anchor
              size="xs"
              c="dimmed"
              href={`https://github.com/dmitry-maslakov/UniHub/commit/${version}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </Anchor>
          ) : (
            <Text size="xs" c="dimmed">
              {label}
            </Text>
          )}
        </Box>
      </Menu.Dropdown>
    </Menu>
  );
}
