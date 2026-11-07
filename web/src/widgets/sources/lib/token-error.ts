import type { TFunction } from 'i18next';
import { ApiError, errorCode } from '@/shared/api';

// the company hosting a Canvas that takes no pasted tokens: a name, so a value
const HOST = 'Instructure';

// What a refused link says, and what to do next; `site` for a source linked
// with the school's address
export function tokenErrorText(
  t: TFunction<'sources'>,
  error: unknown,
  { label, site }: { label: string; site: boolean },
) {
  if (!(error instanceof ApiError)) return t('tokenError.other');
  switch (error.status) {
    case 400:
      if (errorCode(error) === 'URL_NEEDED')
        return t('tokenError.urlNeeded', { label });
      return site ? t('tokenError.badSite') : t('tokenError.badToken');
    case 422:
      return errorCode(error) === 'TOKENS_NOT_ALLOWED'
        ? t('tokenError.notAllowed', { label, host: HOST })
        : t('tokenError.refused', { label });
    case 429:
      return t('tokenError.tooMany');
    case 503:
      return site
        ? t('tokenError.unreachableSite', { label })
        : t('tokenError.unreachable', { label });
    default:
      return t('tokenError.other');
  }
}
