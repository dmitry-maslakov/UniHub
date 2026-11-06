import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SessionGate } from '@/entities/session';
import { AppLayout } from '@/widgets/app-layout';
import { requireSession } from '../router/guards';

export const Route = createFileRoute('/_app')({
  beforeLoad: requireSession,
  component: () => (
    <SessionGate>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </SessionGate>
  ),
});
