import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isNotFound } from '@/shared/api';
import { ErrorState } from './error-state';
import { ListSkeleton } from './list-skeleton';

// A query's four states in one place: loading, failed (with a retry, or
// "not found" for a 404 when `notFound` says what that looks like), empty
// when `isEmpty` says so, and else its data
export function QueryState<T>({
  query,
  children,
  loading,
  isEmpty,
  empty,
  notFound,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: T | undefined;
    refetch(): unknown;
  };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  notFound?: ReactNode;
}) {
  const { t } = useTranslation('common');
  if (query.isPending)
    return loading ?? <ListSkeleton label={t('state.loading')} />;
  // a refetch that failed keeps what the page already shows
  if (query.isError && query.data === undefined)
    return notFound !== undefined && isNotFound(query.error) ? (
      notFound
    ) : (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  const data = query.data as T;
  if (isEmpty?.(data)) return empty;
  return children(data);
}
