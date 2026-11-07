import { Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { folderTree } from '@/entities/file';
import { EmptyState, ListSkeleton, QueryState } from '@/shared/ui';
import { courseFilesQuery } from '../api/course-files';
import { FolderNodeView } from './folder-node';

// Past this many files the folders start closed
const OPEN_UP_TO = 50;

// A course's files as the folders they sit in
export function FilesTree({ slug }: { slug: string }) {
  const { t } = useTranslation('courses');
  const files = useQuery(courseFilesQuery(slug));
  return (
    <QueryState
      query={files}
      loading={<ListSkeleton rows={5} label={t('files.loading')} />}
      isEmpty={(data) => !data.files.length}
      empty={
        <EmptyState title={t('files.empty.title')}>
          {t('files.empty.body')}
        </EmptyState>
      }
    >
      {({ files: all, capped }) => (
        <>
          <Text size="sm" c="dimmed" mb="sm">
            {t('files.count', { count: all.length })}
            {capped && ` ${t('files.capped')}`}
          </Text>
          <nav aria-label={t('files.aria')}>
            <FolderNodeView
              node={folderTree(all)}
              slug={slug}
              open={all.length <= OPEN_UP_TO}
            />
          </nav>
        </>
      )}
    </QueryState>
  );
}
