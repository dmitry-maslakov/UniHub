import type { Schemas } from '@/shared/api';
import { hostOf } from './site';

const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

// Where a source's account stands, in the student's words
export function statusText({
  label,
  mode,
  status,
  instance,
  expiresAt,
}: Schemas['PortalResponse']) {
  if (mode === 'shared')
    return `The hub reads ${label} for everyone now, so your own account isn't used. Unlink it if you like.`;
  switch (status) {
    case 'linked': {
      const where = instance ? ` to ${hostOf(instance)}` : '';
      const until = expiresAt
        ? ` The token works until ${date.format(new Date(expiresAt))}.`
        : '';
      return `Linked${where}.${until}`;
    }
    case 'expired':
      return `Your token expired. Replace it to read ${label} again.`;
    case 'revoked':
      return `${label} no longer takes your token. Replace it to read ${label} again.`;
    default:
      return 'Not linked.';
  }
}
