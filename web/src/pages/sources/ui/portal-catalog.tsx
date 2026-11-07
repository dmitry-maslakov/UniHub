import {
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useState } from 'react';
import { api, type Schemas } from '@/shared/api';
import { CatalogRow } from './catalog-row';
import classes from './portal-catalog.module.css';

const PAGE = 20;

// A public portal's catalog: the courses of a site anyone can read, each
// picked or not, searched by name, twenty at a time so a long catalog
// doesn't bury the portals after it. What the user picks is what the hub
// reads for them there.
export function PortalCatalog({
  portal,
}: {
  portal: Schemas['PortalResponse'];
}) {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  const catalog = api.useInfiniteQuery(
    'get',
    '/api/portals/{portal}/catalog',
    {
      params: {
        path: { portal: portal.portal },
        query: { limit: PAGE, ...(q && { q }) },
      },
    },
    {
      pageParamName: 'offset',
      initialPageParam: 0,
      getNextPageParam: (last, all) => {
        const shown = all.reduce((n, page) => n + page.courses.length, 0);
        return shown < last.total ? shown : undefined;
      },
      placeholderData: (previous) => previous,
    },
  );
  const courses = catalog.data?.pages.flatMap((page) => page.courses) ?? [];
  const listId = `catalog-${portal.portal}`;

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Title order={2} id={listId}>
          {portal.label}
        </Title>
        <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
          {portal.picked ? `${portal.picked} picked` : 'None picked'}
        </Text>
      </Group>
      <Text size="sm" c="dimmed" maw="60ch">
        A public site anyone can read. Pick the courses you follow: they show up
        under Courses, and their posts and files once the hub next reads the
        site.
      </Text>
      <TextInput
        type="search"
        label="Find a course"
        placeholder="Part of its name"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        rightSection={
          catalog.isFetching && !catalog.isFetchingNextPage ? (
            <Loader size="xs" aria-label="Searching" />
          ) : null
        }
        maw="24rem"
      />
      {catalog.isPending && (
        <Loader size="sm" aria-label={`Loading ${portal.label}'s courses`} />
      )}
      {catalog.isError && (
        <Text c="red" role="alert">
          Couldn't load the courses. Reload the page to try again.
        </Text>
      )}
      {catalog.data && !courses.length && (
        <Text c="dimmed">
          {q
            ? `No course's name has “${q}”.`
            : 'The site lists no courses yet.'}
        </Text>
      )}
      {courses.length > 0 && (
        <ul className={classes.list} aria-labelledby={listId}>
          {courses.map((course) => (
            <CatalogRow
              key={course.externalId}
              portal={portal.portal}
              course={course}
            />
          ))}
        </ul>
      )}
      {catalog.hasNextPage && (
        <Button
          variant="default"
          w="fit-content"
          loading={catalog.isFetchingNextPage}
          onClick={() => void catalog.fetchNextPage()}
        >
          Show more courses
        </Button>
      )}
    </Stack>
  );
}
