import { NavLink, Stack } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import classes from './app-layout.module.css';

const items = [
  { to: '/', label: 'Account' },
  { to: '/settings/api-keys', label: 'API keys' },
] as const;

// The header's links on wide screens
export function MainNav() {
  return (
    <nav aria-label="Main" className={classes.nav}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={classes.link}
          activeOptions={{ exact: true }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

// The same links in the drawer on narrow ones
export function DrawerNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Stack component="nav" aria-label="Main" gap={4}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          component={Link}
          to={item.to}
          label={item.label}
          activeOptions={{ exact: true }}
          onClick={onNavigate}
        />
      ))}
    </Stack>
  );
}
