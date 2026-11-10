import { Alert, Box, Group } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/shared/api';
import { EmptyState, ListSkeleton, PageTitle, RowList } from '@/shared/ui';
import { resultKey } from '../lib/result-key';
import { searchErrorKey } from '../lib/search-error';
import { ResultRow } from './result-row';
import { SearchEverything } from './search-everything';
import { SearchForm } from './search-form';
import { SearchScope } from './search-scope';
import { SearchType } from './search-type';

const route = getRouteApi('/_app/search');

// Words searched across the courses in My courses: posts, files and what's
// inside archives; everything the user reads, the hidden courses and the
// public sites' too, when asked
export function SearchPage() {
  const { t } = useTranslation('search');
  const { q = '', course, type, all, from } = route.useSearch();
  const search = api.useQuery(
    'get',
    '/api/search',
    { params: { query: { q, course, type, shown: all ? undefined : 'true' } } },
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
      <SearchForm
        key={`${q}|${course ?? ''}`}
        q={q}
        course={course}
        type={type}
        all={all}
        from={from}
      />
      <Group mt="md" gap="lg">
        <SearchType type={type} />
        {!course && <SearchEverything all={all} />}
      </Group>
      {course && (
        <Box mt="md">
          <SearchScope course={course} from={from} />
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
            {t(
              type || course
                ? 'empty.bodyFiltered'
                : all
                  ? 'empty.body'
                  : 'empty.bodyShown',
            )}
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
                type={type}
                all={all}
                from={from}
              />
            ))}
          </RowList>
        )}
      </Box>
    </>
  );
}
