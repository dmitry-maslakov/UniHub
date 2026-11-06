import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { sessionQuery } from '../api/session-query';

// The signed-in pages, while they're signed in: a session that ends under
// them (expired, revoked, signed out in another tab) sends the user to sign
// in and back here, once, never to an error
export function SessionGate({ children }: { children: ReactNode }) {
  const { data } = useSuspenseQuery(sessionQuery());
  const router = useRouter();
  const leaving = useRef(false);
  useEffect(() => {
    if (data || leaving.current) return;
    leaving.current = true;
    void router.navigate({
      to: '/sign-in',
      search: { next: router.state.location.href },
      replace: true,
    });
  }, [data, router]);
  return data ? children : null;
}
