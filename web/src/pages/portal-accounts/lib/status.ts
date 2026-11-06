import type { Schemas } from '@/shared/api';

// Where a portal's account stands, in the student's words
export function statusText({ mode, status }: Schemas['PortalResponse']) {
  if (mode === 'shared')
    return 'The hub reads this portal for everyone. Nothing to link.';
  switch (status) {
    case 'linked':
      return 'Linked.';
    case 'expired':
      return 'Your token expired. Replace it to read this portal again.';
    case 'revoked':
      return 'The portal revoked your token. Replace it to read this portal again.';
    default:
      return 'Not linked.';
  }
}
