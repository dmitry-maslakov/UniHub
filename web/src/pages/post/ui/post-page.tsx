import { Group, Stack } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useKindLabel } from '@/entities/course';
import { usePortalLabel } from '@/entities/source';
import { api } from '@/shared/api';
import { webAddress } from '@/shared/lib';
import {
  AnchorLink,
  EmptyState,
  ExternalLink,
  NotFoundState,
  PageTitle,
  QueryState,
  TextSkeleton,
} from '@/shared/ui';
import { Attachments } from './attachments';
import { PostBody } from './post-body';
import { PostMeta } from './post-meta';

const route = getRouteApi('/_app/courses/$slug/posts/$itemId');

// A post read in UniHub: its text, its attachments, and a way to the
// portal's own page
export function PostPage() {
  const { t } = useTranslation('post');
  const { slug, itemId } = route.useParams();
  const kind = useKindLabel();
  const portal = usePortalLabel();
  const item = api.useQuery('get', '/api/items/{id}', {
    params: { path: { id: itemId } },
  });

  return (
    <QueryState
      query={item}
      loading={<TextSkeleton lines={3} label={t('loading')} />}
      notFound={
        <NotFoundState
          title={t('notFound.title')}
          description={t('notFound.description')}
          back={
            <AnchorLink to="/courses/$slug" params={{ slug }}>
              {t('notFound.back')}
            </AnchorLink>
          }
        />
      }
    >
      {(post) => {
        const address = webAddress(post.url);
        return (
          <>
            <PageTitle description={<PostMeta item={post} slug={slug} />}>
              {post.title ?? kind(post.kind)}
            </PageTitle>
            <Stack gap="xxl">
              {post.raw === null ? (
                <EmptyState title={t('locked.title')}>
                  {t('locked.body')}
                </EmptyState>
              ) : (
                <PostBody itemId={itemId} />
              )}
              <Attachments slug={slug} itemId={itemId} />
              {address && (
                <Group>
                  <ExternalLink href={address}>
                    {t('openOn', { portal: portal(post.portal) })}
                  </ExternalLink>
                </Group>
              )}
            </Stack>
          </>
        );
      }}
    </QueryState>
  );
}
