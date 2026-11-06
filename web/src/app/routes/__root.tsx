import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from '@tanstack/react-router';
import { NotFoundPage } from '@/pages/not-found';
import type { RouterContext } from '../router/context';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
  notFoundComponent: NotFoundPage,
  head: () => ({ meta: [{ title: 'UniHub' }] }),
});
