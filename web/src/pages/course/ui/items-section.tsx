import { Anchor, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useKindLabel } from '@/entities/course';
import { usePortalLabel } from '@/entities/source';
import { api } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { webAddress } from '@/shared/lib';
import {
  EmptyState,
  ListSkeleton,
  QueryState,
  Row,
  RowAction,
  RowList,
  RowText,
  Section,
} from '@/shared/ui';
import { useDeepLink } from '../lib/use-deep-link';

const PAGE = 50;

// A course's posts, newest first, fifty at a time
export function ItemsSection({ slug }: { slug: string }) {
  const { t } = useTranslation(['courses', 'common']);
  const { date } = useFormat();
  const kind = useKindLabel();
  const portal = usePortalLabel();
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
  const rows = items.data?.pages.flat() ?? [];
  useDeepLink(
    'item-',
    rows.map((row) => row.id),
    {
      ...items,
      pages: items.data?.pages.length ?? 0,
    },
  );

  return (
    <Section title={t('posts.title')} id="posts">
      <QueryState
        query={items}
        loading={<ListSkeleton label={t('posts.loading')} />}
        isEmpty={() => !rows.length}
        empty={
          <EmptyState title={t('posts.empty.title')}>
            {t('posts.empty.body')}
          </EmptyState>
        }
      >
        {() => (
          <RowList label={t('posts.aria')}>
            {rows.map((item) => {
              const address = webAddress(item.url);
              const title = item.title ?? kind(item.kind);
              return (
                <Row key={item.id} id={`item-${item.id}`}>
                  <RowText
                    title={title}
                    meta={[
                      // an untitled post is named by its kind already
                      item.title && kind(item.kind),
                      date(item.publishedAt),
                      item.raw === null && t('common:state.notAvailableYet'),
                    ]}
                  />
                  {address && (
                    <RowAction>
                      <Anchor
                        href={address}
                        size="sm"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('posts.openOnAria', {
                          title,
                          portal: portal(item.portal),
                        })}
                      >
                        {t('posts.openOn', { portal: portal(item.portal) })}
                      </Anchor>
                    </RowAction>
                  )}
                </Row>
              );
            })}
          </RowList>
        )}
      </QueryState>
      {items.hasNextPage && (
        <Button
          variant="default"
          w="fit-content"
          loading={items.isFetchingNextPage}
          onClick={() => void items.fetchNextPage()}
        >
          {t('posts.more')}
        </Button>
      )}
    </Section>
  );
}
