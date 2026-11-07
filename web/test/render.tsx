import { render } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { Providers } from '@/app/entrypoint/providers';
import { createQueryClient } from '@/app/entrypoint/query-client';
import { createAppRouter } from '@/app/router/router';
import { FollowLanguage } from './follow-language';

// The whole app at `url`, as a browser would open it
export function renderApp(url: string) {
  const queryClient = createQueryClient();
  const router = createAppRouter(
    queryClient,
    createMemoryHistory({ initialEntries: [url] }),
  );
  render(
    <Providers queryClient={queryClient}>
      <FollowLanguage router={router} />
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, queryClient };
}
