import { RouterProvider } from '@tanstack/react-router';
import { Providers } from './providers';
import { createQueryClient } from './query-client';
import { createAppRouter } from '../router/router';

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

export function App() {
  return (
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  );
}
