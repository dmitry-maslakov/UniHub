import type { TFunction } from 'i18next';
import { ApiError, errorCode } from '@/shared/api';

// What a refused pick says, and what to do next
export function pickErrorText(
  t: TFunction<'sources'>,
  error: unknown,
  pick: boolean,
) {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 404) return t('pick.gone');
  if (status === 429) return t('pick.tooFast');
  return pick ? t('pick.failed') : t('pick.unpickFailed');
}

// What a refused "show with" says, and what to do next
export function showWithErrorText(t: TFunction<'sources'>, error: unknown) {
  if (errorCode(error) === 'NOT_YOUR_COURSE') return t('showWith.notYours');
  if (error instanceof ApiError && [404, 429].includes(error.status))
    return pickErrorText(t, error, true);
  return t('showWith.failed');
}
