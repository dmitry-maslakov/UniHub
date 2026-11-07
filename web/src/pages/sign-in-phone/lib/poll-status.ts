// Better Auth's answers to a screen polling for its approval (RFC 8628)
export type PollStatus =
  'approved' | 'pending' | 'slowDown' | 'denied' | 'expired' | 'failed';

export const pollStatus = (code?: string): PollStatus =>
  code === 'authorization_pending'
    ? 'pending'
    : code === 'slow_down'
      ? 'slowDown'
      : code === 'access_denied'
        ? 'denied'
        : code === 'expired_token'
          ? 'expired'
          : 'failed';
