import { Anchor, Button, Loader, Stack, Text, Title } from '@mantine/core';
import { api } from '@/shared/api';
import { webAddress } from '@/shared/lib';
import { day } from '../lib/format';
import { useDeepLink } from '../lib/use-deep-link';
import classes from './course.module.css';

const PAGE = 50;

// A course's posts, newest first, fifty at a time
export function ItemsSection({ slug }: { slug: string }) {
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
    <Stack component="section" gap="xs" aria-labelledby="posts">
      <Title order={2} id="posts">
        Posts
      </Title>
      {items.isPending && <Loader size="sm" aria-label="Loading posts" />}
      {items.isError && (
        <Text c="red" role="alert">
          Couldn't load the posts. Reload the page to try again.
        </Text>
      )}
      {items.data && !rows.length && (
        <Text c="dimmed">No posts in this course yet.</Text>
      )}
      {rows.length > 0 && (
        <ul className={classes.list} aria-labelledby="posts">
          {rows.map((item) => {
            const address = webAddress(item.url);
            return (
              <li key={item.id} id={`item-${item.id}`} className={classes.row}>
                <Stack gap={2} miw={0}>
                  <Text fw={600}>{item.title ?? item.kind}</Text>
                  <Text size="sm" c="dimmed">
                    {[item.kind, day(item.publishedAt)]
                      .filter(Boolean)
                      .join(' · ')}
                    {item.raw === null && ' · Not available yet'}
                  </Text>
                </Stack>
                {address && (
                  <Anchor
                    href={address}
                    size="sm"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${item.title ?? item.kind} on ${item.portal}`}
                  >
                    On {item.portal}
                  </Anchor>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.hasNextPage && (
        <Button
          variant="default"
          w="fit-content"
          loading={items.isFetchingNextPage}
          onClick={() => void items.fetchNextPage()}
        >
          Show more posts
        </Button>
      )}
    </Stack>
  );
}
