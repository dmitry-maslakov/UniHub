import { ApiError } from '@/shared/api';

// What a refused pick says, and what to do next
export function pickErrorText(error: unknown, pick: boolean) {
  const status = error instanceof ApiError ? error.status : undefined;
  switch (status) {
    case 404:
      return 'That course is no longer in the catalog. Reload the page.';
    case 422:
      return 'You can pick up to 100 courses. Unpick one first.';
    case 429:
      return 'Too many changes in a short time. Wait a minute, then try again.';
    default:
      return pick
        ? "Couldn't pick the course. Try again."
        : "Couldn't unpick the course. Try again.";
  }
}
