import { useSuspenseQuery } from '@tanstack/react-query';
import { sessionQuery } from '../api/session-query';

// the signed-in user, under SessionGate, which renders nothing without one
export function useSession() {
  const { data } = useSuspenseQuery(sessionQuery());
  if (!data) throw new Error('useSession() outside SessionGate');
  return data;
}
