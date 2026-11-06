import { Alert, Loader, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { api } from '@/shared/api';
import { PageTitle } from '@/shared/ui';
import { searchErrorText } from '../lib/search-error';
import classes from './search.module.css';
import { ResultRow } from './result-row';
import { SearchForm } from './search-form';

const route = getRouteApi('/_app/search');

// Words searched across the user's courses: posts, files and what's inside
// archives
export function SearchPage() {
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
      <PageTitle description="Find a word in the posts and files of your courses, including the text inside slides, documents and archives.">
        Search
      </PageTitle>
      <SearchForm key={q} q={q} />
      <div aria-live="polite">
        {search.isFetching && (
          <Loader size="sm" mt="xl" aria-label="Searching" />
        )}
        {search.isError && (
          <Alert color="red" role="alert" mt="xl">
            {searchErrorText(search.error)}
          </Alert>
        )}
        {results && !results.length && !search.isFetching && (
          <Text c="dimmed" mt="xl">
            Nothing in your courses matches “{q}”. Try other words, or fewer.
          </Text>
        )}
        {results && results.length > 0 && !search.isFetching && (
          <ul className={classes.list} aria-label="Results">
            {results.map((result, i) => (
              <ResultRow key={i} result={result} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
