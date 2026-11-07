import { ApiError } from '@/shared/api';

// the key of what a failed search says
export function searchErrorKey(error: unknown) {
  switch (error instanceof ApiError ? error.status : undefined) {
    case 429:
      return 'error.rateLimited';
    case 503:
      return 'error.unavailable';
    default:
      return 'error.other';
  }
}
