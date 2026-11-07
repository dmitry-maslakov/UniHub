import { Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OPEN_UP_TO, folderTree } from '@/entities/file';
import { SelectAll, type Selection } from '@/features/download-selection';
import { EmptyState, ListSkeleton, QueryState } from '@/shared/ui';
import { courseFilesQuery } from '../api/course-files';
import { targetOf } from '../lib/target-of';
import { FolderNodeView } from './folder-node';

// A course's files as the folders they sit in
export function FilesTree({
  slug,
  selection,
}: {
  slug: string;
  selection: Selection;
}) {
  const { t } = useTranslation('courses');
  const files = useQuery(courseFilesQuery(slug));
  const tree = useMemo(() => folderTree(files.data?.files ?? []), [files.data]);
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
          <Group justify="space-between" gap="md" mb="sm">
            <SelectAll
              targets={all.flatMap((file) => targetOf(file) ?? [])}
              selection={selection}
            />
            <Text size="sm" c="dimmed">
              {t('files.count', { count: all.length })}
              {capped && ` ${t('files.capped')}`}
            </Text>
          </Group>
          <nav aria-label={t('files.aria')}>
            <FolderNodeView
              node={tree}
              slug={slug}
              open={all.length <= OPEN_UP_TO}
              selection={selection}
            />
          </nav>
        </>
      )}
    </QueryState>
  );
}
