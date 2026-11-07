import { Alert, Box } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/shared/api';
import { EmptyState, ListSkeleton, PageTitle, RowList } from '@/shared/ui';
import { resultKey } from '../lib/result-key';
import { searchErrorKey } from '../lib/search-error';
import { ResultRow } from './result-row';
import { SearchForm } from './search-form';
import { SearchScope } from './search-scope';

const route = getRouteApi('/_app/search');

// Words searched across the user's courses: posts, files and what's inside
// archives
export function SearchPage() {
  const { t } = useTranslation('search');
  const { q = '', course } = route.useSearch();
  const search = api.useQuery(
    'get',
    '/api/search',
    { params: { query: { q, course } } },
    // a refused search is refused again, and a limit is waited out
    {
      enabled: q.length >= 2,
      retry: false,
      // each search counts against the hub's per-minute limit
      refetchOnWindowFocus: false,
    },
  );
  const results = search.data?.results;

  return (
    <>
      <PageTitle description={t('description')}>{t('title')}</PageTitle>
      <SearchForm key={q} q={q} course={course} />
      {course && (
        <Box mt="md">
          <SearchScope course={course} />
        </Box>
      )}
      <Box aria-live="polite" mt="xl">
        {search.isLoading && <ListSkeleton rows={3} label={t('searching')} />}
        {search.isError && (
          // no retry: the form is the retry
          <Alert color="red" role="alert">
            {t(searchErrorKey(search.error))}
          </Alert>
        )}
        {results && !results.length && (
          <EmptyState title={t('empty.title', { q })}>
            {t('empty.body')}
          </EmptyState>
        )}
        {results && results.length > 0 && (
          <RowList label={t('results.aria')}>
            {results.map((result) => (
              <ResultRow
                key={resultKey(result)}
                result={result}
                q={q}
                scope={course}
              />
            ))}
          </RowList>
        )}
      </Box>
    </>
  );
}
