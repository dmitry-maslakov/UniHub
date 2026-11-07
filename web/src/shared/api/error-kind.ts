import { authError } from './auth-error';

export type ErrorKind =
  'offline' | 'rateLimited' | 'unavailable' | 'server' | 'other';

// What went wrong, in the few ways a person can act on differently: a fetch
// that failed outright is offline; otherwise the status the hub or Better
// Auth answered with
export function errorKind(error: unknown): ErrorKind {
  if (error instanceof TypeError) return 'offline';
  const status = authError(error)?.status;
  if (status === 429) return 'rateLimited';
  if (status === 503) return 'unavailable';
  if (status !== undefined && status >= 500) return 'server';
  return 'other';
}
