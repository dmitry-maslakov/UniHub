import type { TFunction } from 'i18next';
import type { Schemas } from '@/shared/api';
import { hostOf } from './site';

// Where a source's account stands, in the student's words; `date` says a
// date as the current language does. Just linked, its first read is said
// in place of where it's linked to.
export function statusText(
  t: TFunction<'sources'>,
  {
    label,
    mode,
    status,
    instance,
    expiresAt,
    firstSync,
  }: Schemas['PortalResponse'],
  date: (value: string) => string | undefined,
) {
  if (mode === 'shared') return t('status.shared', { label });
  switch (status) {
    case 'linked': {
      if (firstSync) return t('status.firstSync');
      const site = instance ? hostOf(instance) : undefined;
      const until = expiresAt ? date(expiresAt) : undefined;
      if (site && until)
        return t('status.linkedToUntil', { site, date: until });
      if (site) return t('status.linkedTo', { site });
      if (until) return t('status.linkedUntil', { date: until });
      return t('status.linked');
    }
    case 'expired':
      return t('status.expired', { label });
    case 'revoked':
      return t('status.revoked', { label });
    default:
      return t('status.notLinked');
  }
}
