import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { api } from '@/shared/api';
import { EmptyState, QueryState, TextSkeleton } from '@/shared/ui';
import classes from './post.module.css';

// A post's text as the hub reads it. Plain text, set as React text, never
// as HTML, whatever the portal sent.
export function PostBody({ itemId }: { itemId: string }) {
  const { t } = useTranslation('post');
  const text = api.useQuery('get', '/api/items/{id}/text', {
    params: { path: { id: itemId } },
  });
  return (
    <QueryState
      query={text}
      loading={<TextSkeleton lines={6} label={t('loading')} />}
      isEmpty={(data) => !data.text.trim()}
      empty={
        <EmptyState title={t('noText.title')}>{t('noText.body')}</EmptyState>
      }
    >
      {(data) => <Text className={classes.body}>{data.text}</Text>}
    </QueryState>
  );
}
