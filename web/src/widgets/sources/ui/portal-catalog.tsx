import {
  Group,
  Loader,
  Pagination,
  Stack,
  Text,
  TextInput,
  Title,
  type TitleOrder,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Schemas } from '@/shared/api';
import { EmptyState, ListSkeleton, QueryState, RowList } from '@/shared/ui';
import { CatalogRow } from './catalog-row';

const PAGE = 10;

// A public portal's catalog: the courses of a site anyone can read, each
// picked or not, searched by name, ten a page so that a long catalog never
// buries the sources after it. What the user picks is what the hub reads
// for them there.
export function PortalCatalog({
  portal,
  order,
}: {
  portal: Schemas['PortalResponse'];
  order: TitleOrder;
}) {
  const { t } = useTranslation(['sources', 'common']);
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  // the page asked for, with the words it was asked for: new words start
  // at the first
  const [paging, setPaging] = useState({ q: '', page: 1 });
  const page = paging.q === q ? paging.page : 1;
  const catalog = api.useQuery(
    'get',
    '/api/portals/{portal}/catalog',
    {
      params: {
        path: { portal: portal.portal },
        query: { limit: PAGE, offset: (page - 1) * PAGE, ...(q && { q }) },
      },
    },
    { placeholderData: keepPreviousData },
  );

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Title order={order}>{portal.label}</Title>
        <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
          {portal.picked
            ? t('catalog.picked', { count: portal.picked })
            : t('catalog.nonePicked')}
        </Text>
      </Group>
      <Text size="sm" c="dimmed" maw="60ch">
        {t('catalog.description')}
      </Text>
      <TextInput
        type="search"
        label={t('catalog.search.label')}
        placeholder={t('catalog.search.placeholder')}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        rightSection={
          catalog.isFetching ? (
            <Loader size="xs" aria-label={t('catalog.searching')} />
          ) : null
        }
        maw="24rem"
      />
      <QueryState
        query={catalog}
        loading={
          <ListSkeleton
            rows={3}
            label={t('catalog.loading', { label: portal.label })}
          />
        }
        isEmpty={(data) => !data.courses.length}
        empty={
          q ? (
            <EmptyState title={t('catalog.noMatch.title', { q })}>
              {t('catalog.noMatch.body')}
            </EmptyState>
          ) : (
            <EmptyState title={t('catalog.empty.title')}>
              {t('catalog.empty.body')}
            </EmptyState>
          )
        }
      >
        {(data) => (
          <>
            <RowList label={portal.label}>
              {data.courses.map((course) => (
                <CatalogRow
                  key={course.externalId}
                  portal={portal.portal}
                  course={course}
                />
              ))}
            </RowList>
            {data.total > PAGE && (
              <Pagination
                mt="sm"
                size="sm"
                total={Math.ceil(data.total / PAGE)}
                value={page}
                siblings={0}
                boundaries={1}
                onChange={(p) => setPaging({ q, page: p })}
                getControlProps={(control) => ({
                  'aria-label': t(
                    control === 'previous'
                      ? 'common:pagination.previous'
                      : 'common:pagination.next',
                  ),
                })}
                getItemProps={(n) => ({
                  'aria-label': t('common:pagination.page', { n }),
                })}
              />
            )}
          </>
        )}
      </QueryState>
    </Stack>
  );
}
