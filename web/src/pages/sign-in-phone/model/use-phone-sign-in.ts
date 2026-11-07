import { useTimeout } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useSessionActions } from '@/entities/session';
import { pollToken, requestCode } from '../api/device-sign-in';

// seconds more between polls each time Better Auth says slow_down (RFC 8628)
const SLOW_DOWN_SECONDS = 5;

// A code for this screen, polled until a phone answers it; approved, the
// session is read again and the screen goes on to `next`
export function usePhoneSignIn(next: string) {
  const router = useRouter();
  const { refresh } = useSessionActions();
  const [attempt, setAttempt] = useState(0);
  const [extra, setExtra] = useState(0);
  const [waited, setWaited] = useState(false);

  const code = useQuery({
    queryKey: ['auth', 'device-code', attempt],
    queryFn: requestCode,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const interval = code.data?.interval ?? 5;

  // the first poll comes one interval after the code
  const { start, clear } = useTimeout(() => setWaited(true), interval * 1000);
  useEffect(() => {
    setWaited(false);
    if (code.data) start();
    return clear;
  }, [code.data, start, clear]);

  const poll = useQuery({
    queryKey: ['auth', 'device-token', code.data?.device_code],
    queryFn: () => pollToken(code.data!.device_code),
    enabled: !!code.data && waited,
    gcTime: 0,
    retry: false,
    // an answer given stays given: a denied or expired code is gone on the
    // server, and an early poll only earns slow_down
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => {
      const status = query.state.data;
      return !status || status === 'pending' || status === 'slowDown'
        ? (interval + extra) * 1000
        : false;
    },
  });

  useEffect(() => {
    if (poll.data === 'slowDown') setExtra((e) => e + SLOW_DOWN_SECONDS);
    if (poll.data === 'approved')
      void refresh().then(() => router.navigate({ href: next, replace: true }));
    // once per answer, not per render
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.dataUpdatedAt]);

  const newCode = () => {
    setExtra(0);
    setAttempt((a) => a + 1);
  };

  return { code, status: poll.data, newCode };
}
