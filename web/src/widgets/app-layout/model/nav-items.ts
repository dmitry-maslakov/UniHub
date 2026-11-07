// what the navigation holds, in order; `label` is a key of the shell
// namespace and a `to` must name a route
export type NavLabelKey =
  'nav.myCourses' | 'nav.search' | 'nav.sources' | 'nav.connect' | 'nav.admin';

export interface NavItem {
  to: '/' | '/search' | '/sources' | '/connect';
  label: NavLabelKey;
  adminOnly?: true;
}

export const navItems: NavItem[] = [
  { to: '/', label: 'nav.myCourses' },
  { to: '/search', label: 'nav.search' },
  { to: '/sources', label: 'nav.sources' },
  { to: '/connect', label: 'nav.connect' },
];
