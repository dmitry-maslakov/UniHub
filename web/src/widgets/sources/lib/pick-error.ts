import { ApiError } from '@/shared/api';

const codeOf = (error: ApiError) =>
  (error.error as { code?: unknown } | null)?.code;

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

// What a refused "show with" says, and what to do next
export function showWithErrorText(error: unknown) {
  if (error instanceof ApiError && codeOf(error) === 'NOT_YOUR_COURSE')
    return "That course isn't one you read through your own account any more. Reload the page.";
  if (error instanceof ApiError && [404, 429].includes(error.status))
    return pickErrorText(error, true);
  return "Couldn't move the course. Try again.";
}
