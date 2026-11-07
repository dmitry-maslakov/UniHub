import { useIsAdmin } from '@/entities/session';
import { navItems } from './nav-items';

// the navigation's items for this user: Admin only for an admin
export function useNavItems() {
  const admin = useIsAdmin();
  return navItems.filter((item) => admin || !item.adminOnly);
}
