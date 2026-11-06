import { AppShell, Burger, Container, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ColorSchemeToggle } from '@/features/toggle-color-scheme';
import { Wordmark } from '@/shared/ui';
import classes from './app-layout.module.css';
import { DrawerNav, MainNav } from './main-nav';
import { UserMenu } from './user-menu';

// The signed-in shell: the name, the navigation, light or dark and the
// user's menu over one narrow column
export function AppLayout({ children }: { children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: 280,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: true },
      }}
    >
      <AppShell.Header withBorder={false} className={classes.header}>
        <Group className={classes.bar} justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={opened ? 'Close navigation' : 'Open navigation'}
            />
            <Link to="/" className={classes.home}>
              <Wordmark />
            </Link>
            <Group visibleFrom="sm">
              <MainNav />
            </Group>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <ColorSchemeToggle />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        {opened && <DrawerNav onNavigate={close} />}
      </AppShell.Navbar>
      <AppShell.Main>
        <Container size="40rem" px="md" pt="xxl" pb="xxl">
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
