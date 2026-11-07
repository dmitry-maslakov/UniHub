import { ApiError } from '@/shared/api';

// What a refused link says, and what to do next
export function tokenErrorText(error: unknown) {
  const status = error instanceof ApiError ? error.status : undefined;
  switch (status) {
    case 400:
      return "That doesn't look like a token. It has no spaces or line breaks.";
    case 422:
      return "The portal didn't accept that token. Check it and try again.";
    case 429:
      return 'Too many tries in a short time. Wait a minute, then try again.';
    case 503:
      return "The portal couldn't be reached just now. Try again later.";
    default:
      return "Couldn't link the account. Try again.";
  }
}
