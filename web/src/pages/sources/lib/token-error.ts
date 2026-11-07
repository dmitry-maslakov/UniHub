import { ApiError } from '@/shared/api';

// the hub's reason for a refusal, as its body names it
const codeOf = (error: ApiError) =>
  (error.error as { code?: string } | undefined)?.code;

// What a refused link says, and what to do next; `site` for a source linked
// with the school's address
export function tokenErrorText(
  error: unknown,
  { label, site }: { label: string; site: boolean },
) {
  if (!(error instanceof ApiError))
    return "Couldn't link the account. Try again.";
  switch (error.status) {
    case 400:
      if (codeOf(error) === 'URL_NEEDED')
        return `Linking ${label} needs your school's address, which this page can't take yet. Ask an admin of the hub.`;
      return site
        ? "That address or token doesn't look right. The address starts with https://, and a token has no spaces or line breaks."
        : "That doesn't look like a token. It has no spaces or line breaks.";
    case 422:
      return codeOf(error) === 'TOKENS_NOT_ALLOWED'
        ? `Instructure hosts this ${label}, and lets apps in only by OAuth, never by a pasted token, so the hub can't link it this way.`
        : `${label} didn't accept that token. Check it and try again.`;
    case 429:
      return 'Too many tries in a short time. Wait a minute, then try again.';
    case 503:
      return site
        ? `No ${label} answered at that address. Check it, or try again later.`
        : `${label} couldn't be reached just now. Try again later.`;
    default:
      return "Couldn't link the account. Try again.";
  }
}
