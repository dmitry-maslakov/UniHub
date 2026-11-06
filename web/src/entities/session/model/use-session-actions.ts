import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { authClient } from '@/shared/api';
import { sessionQuery } from '../api/session-query';

// Reads the session anew once it changed, and signs out: nothing of the
// user stays in the cache, and sign-in may send them back to `next`
export function useSessionActions() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const refresh = () =>
    queryClient.fetchQuery({ ...sessionQuery(), staleTime: 0 });

  const signOut = async (next?: string) => {
    await authClient.signOut();
    queryClient.clear();
    await router.navigate({ to: '/sign-in', search: { next } });
  };

  return { refresh, signOut };
}
