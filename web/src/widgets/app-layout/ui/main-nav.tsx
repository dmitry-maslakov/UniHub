import { NavLink, Stack } from '@mantine/core';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { isCurrent } from '../lib/is-current';
import { useNavItems } from '../model/use-nav-items';
import classes from './app-layout.module.css';

const usePathname = () =>
  useRouterState({ select: (s) => s.location.pathname });

// The header's links on wide screens
export function MainNav() {
  const { t } = useTranslation('shell');
  const pathname = usePathname();
  const navItems = useNavItems();
  return (
    <nav aria-label={t('nav.aria')} className={classes.nav}>
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={classes.link}
          activeOptions={{ exact: true }}
          aria-current={isCurrent(pathname, item.to) ? 'page' : undefined}
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}

// The same links in the drawer on narrow ones
export function DrawerNav({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation('shell');
  const pathname = usePathname();
  const navItems = useNavItems();
  return (
    <Stack component="nav" aria-label={t('nav.aria')} gap={4}>
      {navItems.map((item) => {
        const current = isCurrent(pathname, item.to);
        return (
          <NavLink
            key={item.to}
            component={Link}
            to={item.to}
            label={t(item.label)}
            active={current}
            aria-current={current ? 'page' : undefined}
            onClick={onNavigate}
            styles={{ root: { minHeight: 44 } }}
          />
        );
      })}
    </Stack>
  );
}
