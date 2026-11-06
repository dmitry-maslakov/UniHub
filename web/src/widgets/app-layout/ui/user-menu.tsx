import { Avatar, Box, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconKey, IconLogout, IconUser } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useSession, useSessionActions } from '@/entities/session';

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
          to="/"
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
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLogout size={16} stroke={1.75} />}
          onClick={() => void signOut()}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
