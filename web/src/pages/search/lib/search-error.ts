import { ApiError } from '@/shared/api';

// What a failed search says, and what to do next
export function searchErrorText(error: unknown) {
  switch (error instanceof ApiError ? error.status : undefined) {
    case 429:
      return 'Slow down: search allows 20 searches a minute. Wait a moment, then search again.';
    case 503:
      return 'Search is unavailable right now. Try again in a little while.';
    default:
      return "Couldn't search just now. Try again.";
  }
}
