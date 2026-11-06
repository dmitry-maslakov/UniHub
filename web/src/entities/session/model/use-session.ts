import { useSuspenseQuery } from '@tanstack/react-query';
import { sessionQuery } from '../api/session-query';

// the signed-in user, inside routes that sign in first (they load it)
export function useSession() {
  const { data } = useSuspenseQuery(sessionQuery());
  if (!data) throw new Error('useSession() outside a signed-in route');
  return data;
}
