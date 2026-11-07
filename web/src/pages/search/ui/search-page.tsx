import { Alert, Box } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/shared/api';
import { EmptyState, ListSkeleton, PageTitle, RowList } from '@/shared/ui';
import { resultKey } from '../lib/result-key';
import { searchErrorKey } from '../lib/search-error';
import { ResultRow } from './result-row';
import { SearchForm } from './search-form';

const route = getRouteApi('/_app/search');

// Words searched across the user's courses: posts, files and what's inside
// archives
export function SearchPage() {
  const { t } = useTranslation('search');
  const { q = '' } = route.useSearch();
  const search = api.useQuery(
    'get',
    '/api/search',
    { params: { query: { q } } },
    // a refused search is refused again, and a limit is waited out
    { enabled: q.length >= 2, retry: false },
  );
  const results = search.data?.results;

  return (
    <>
      <PageTitle description={t('description')}>{t('title')}</PageTitle>
      <SearchForm key={q} q={q} />
      <Box aria-live="polite" mt="xl">
        {search.isFetching && <ListSkeleton rows={3} label={t('searching')} />}
        {search.isError && (
          // no retry: the form is the retry
          <Alert color="red" role="alert">
            {t(searchErrorKey(search.error))}
          </Alert>
        )}
        {results && !results.length && !search.isFetching && (
          <EmptyState title={t('empty.title', { q })}>
            {t('empty.body')}
          </EmptyState>
        )}
        {results && results.length > 0 && !search.isFetching && (
          <RowList label={t('results.aria')}>
            {results.map((result) => (
              <ResultRow key={resultKey(result)} result={result} />
            ))}
          </RowList>
        )}
      </Box>
    </>
  );
}
