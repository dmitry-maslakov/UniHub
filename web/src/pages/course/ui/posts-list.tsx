import { Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useKindLabel } from '@/entities/course';
import { api } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  QueryState,
  Row,
  RowLink,
  RowList,
  RowText,
} from '@/shared/ui';

const PAGE = 50;

// A course's posts, newest first, fifty at a time, each opening its page
export function PostsList({ slug }: { slug: string }) {
  const { t } = useTranslation(['courses', 'common']);
  const { date } = useFormat();
  const kind = useKindLabel();
  const items = api.useInfiniteQuery(
    'get',
    '/api/courses/{slug}/items',
    { params: { path: { slug }, query: { limit: PAGE } } },
    {
      pageParamName: 'offset',
      initialPageParam: 0,
      getNextPageParam: (last, all) =>
        last.length < PAGE ? undefined : all.length * PAGE,
    },
  );

  return (
    <>
      <QueryState
        query={items}
        loading={<ListSkeleton rows={5} label={t('posts.loading')} />}
        isEmpty={(data) => !data.pages[0]?.length}
        empty={
          <EmptyState title={t('posts.empty.title')}>
            {t('posts.empty.body')}
          </EmptyState>
        }
      >
        {(data) => (
          <RowList label={t('posts.aria')}>
            {data.pages.flat().map((item) => (
              <Row key={item.id}>
                <RowLink
                  to="/courses/$slug/posts/$itemId"
                  params={{ slug, itemId: item.id }}
                >
                  <RowText
                    title={item.title ?? kind(item.kind)}
                    meta={[
                      kind(item.kind),
                      date(item.publishedAt),
                      item.raw === null && t('common:state.notAvailableYet'),
                    ]}
                  />
                </RowLink>
              </Row>
            ))}
          </RowList>
        )}
      </QueryState>
      {items.isFetchNextPageError && (
        <ErrorState
          error={items.error}
          onRetry={() => void items.fetchNextPage()}
        />
      )}
      {items.hasNextPage && (
        <Button
          variant="default"
          w="fit-content"
          mt="md"
          loading={items.isFetchingNextPage}
          onClick={() => void items.fetchNextPage()}
        >
          {t('posts.more')}
        </Button>
      )}
    </>
  );
}
