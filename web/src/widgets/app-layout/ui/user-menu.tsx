import { Anchor, Avatar, Box, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconKey, IconLock, IconLogout, IconUser } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useSession, useSessionActions } from '@/entities/session';

// the commit this build is of; unset in development
const version: string = import.meta.env.VITE_COMMIT_SHA ?? 'dev';

export function UserMenu() {
  const { user } = useSession();
  const { signOut } = useSessionActions();
  return (
    <Menu position="bottom-end" width={260} offset={8}>
      <Menu.Target>
        <UnstyledButton aria-label={`Account menu for ${user.name}`}>
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
          Account
        </Menu.Item>
        <Menu.Item
          component={Link}
          to="/settings/api-keys"
          leftSection={<IconKey size={16} stroke={1.75} />}
        >
          API keys
        </Menu.Item>
        <Menu.Item
          component={Link}
          to="/privacy"
          leftSection={<IconLock size={16} stroke={1.75} />}
        >
          Privacy
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLogout size={16} stroke={1.75} />}
          onClick={() => void signOut()}
        >
          Sign out
        </Menu.Item>
        <Menu.Divider />
        <Box px="sm" py={4}>
          <Text size="xs" c="dimmed">
            Version{' '}
            {/^[0-9a-f]{7,40}$/.test(version) ? (
              <Anchor
                size="xs"
                href={`https://github.com/dmitry-maslakov/UniHub/commit/${version}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {version.slice(0, 7)}
              </Anchor>
            ) : (
              'dev'
            )}
          </Text>
        </Box>
      </Menu.Dropdown>
    </Menu>
  );
}
