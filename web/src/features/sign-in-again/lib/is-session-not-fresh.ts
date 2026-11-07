import { authError } from '@/shared/api';

// What outlasts a session (an API key, a screen's sign-in, deleting the
// account) takes one signed in within a day: the hub and Better Auth answer
// SESSION_NOT_FRESH, or SESSION_EXPIRED to a stale delete
export const isSessionNotFresh = (error: unknown) => {
  const code = authError(error)?.code;
  return code === 'SESSION_NOT_FRESH' || code === 'SESSION_EXPIRED';
};
