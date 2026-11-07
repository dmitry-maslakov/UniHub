import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAdmin } from '../../router/guards';

// Admins only: anyone else finds nothing here
export const Route = createFileRoute('/_app/admin')({
  beforeLoad: requireAdmin,
  component: Outlet,
});
