import { NavLink, Stack } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import classes from './app-layout.module.css';

const items = [
  { to: '/', label: 'My courses' },
  { to: '/search', label: 'Search' },
  { to: '/sources', label: 'Sources' },
  { to: '/account', label: 'Account' },
  { to: '/settings/api-keys', label: 'API keys' },
] as const;

// My courses is the home page, so only an exact match is it
const exact = (to: string) => ({ exact: to === '/' });

// The header's links on wide screens
export function MainNav() {
  return (
    <nav aria-label="Main" className={classes.nav}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={classes.link}
          activeOptions={exact(item.to)}
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
          activeOptions={exact(item.to)}
          onClick={onNavigate}
        />
      ))}
    </Stack>
  );
}
