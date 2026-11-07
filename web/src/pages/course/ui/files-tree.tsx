import { Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SelectAll, type Selection } from '@/features/download-selection';
import { EmptyState, ListSkeleton, QueryState } from '@/shared/ui';
import { courseFilesQuery } from '../api/course-files';
import { targetOf } from '../lib/target-of';
import type { FilesView } from '../model/search';
import { FilesViewSwitch } from './files-view-switch';
import { FolderTree } from './folder-tree';
import { NewFiles } from './new-files';
import { NewestFiles } from './newest-files';

// A course's files: by folder under what's new, or one list newest first
export function FilesTree({
  slug,
  selection,
  view,
  onViewChange,
}: {
  slug: string;
  selection: Selection;
  view: FilesView;
  onViewChange: (view: FilesView) => void;
}) {
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
      {({ files: all, capped }) => {
        // a course whose portals give no dates has only its folders
        const dated = all.some((file) => file.changedAt !== null);
        const shown = dated ? view : 'folders';
        return (
          <>
            <Group justify="space-between" align="center" gap="sm" mb="sm">
              <Group gap="md">
                <SelectAll
                  targets={all.flatMap((file) => targetOf(file) ?? [])}
                  selection={selection}
                />
                <Text size="sm" c="dimmed">
                  {t('files.count', { count: all.length })}
                  {capped && ` ${t('files.capped')}`}
                </Text>
              </Group>
              {dated && (
                <FilesViewSwitch value={shown} onChange={onViewChange} />
              )}
            </Group>
            {shown === 'newest' ? (
              <NewestFiles files={all} slug={slug} selection={selection} />
            ) : (
              <>
                <NewFiles
                  files={all}
                  slug={slug}
                  selection={selection}
                  onShowAll={() => onViewChange('newest')}
                />
                <FolderTree files={all} slug={slug} selection={selection} />
              </>
            )}
          </>
        );
      }}
    </QueryState>
  );
}
