import { authError } from '@/shared/api';

// What outlasts a session (an API key, a screen's sign-in) takes one signed
// in within a day: Better Auth and the hub both answer SESSION_NOT_FRESH
export const isSessionNotFresh = (error: unknown) =>
  authError(error)?.code === 'SESSION_NOT_FRESH';
