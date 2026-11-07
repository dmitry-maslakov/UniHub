import { ActionIcon, Group, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  OPEN_UP_TO,
  contentUrl,
  FileTypeIcon,
  FolderBranch,
  fileType,
} from '@/entities/file';
import { SelectableRow, type Selection } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { ListSkeleton, QueryState } from '@/shared/ui';
import {
  MembersTree,
  archiveMembersQuery,
  placeMembers,
} from '@/widgets/archive-members';
import { targetOf } from '../lib/target-of';
import classes from './course.module.css';

// An archive of the course's files as a folder: its members load on the
// first open and show as the archive page's tree does, and the whole
// archive can still be ticked or downloaded.
export function ArchiveNode({
  file,
  slug,
  open,
  onToggle,
  selection,
}: {
  file: Schemas['FileResponse'];
  slug: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  selection: Selection;
}) {
  const { t } = useTranslation('files');
  const { size, shortDate } = useFormat();
  const [opened, setOpened] = useState(open);
  const target = targetOf(file);
  const facts = [size(file.size), shortDate(file.changedAt)]
    .filter(Boolean)
    .join(' · ');
  return (
    <SelectableRow
      label={t('selection.select', { name: file.name })}
      targets={target ? [target] : []}
      selection={selection}
    >
      <Group wrap="nowrap" gap="xs" align="flex-start">
        <div className={classes.branch}>
          <FolderBranch
            name={file.name}
            facts={facts}
            open={open}
            onToggle={(next) => {
              setOpened(next);
              onToggle(next);
            }}
            icon={<FileTypeIcon type={fileType(file.mime, file.name)} />}
          >
            <ArchiveMembers
              file={file}
              slug={slug}
              selection={selection}
              opened={opened}
            />
          </FolderBranch>
        </div>
        <ActionIcon
          className={classes.rowAction}
          variant="subtle"
          component="a"
          href={contentUrl(file.id)}
          aria-label={t('downloadName', { name: file.name })}
        >
          <IconDownload size={16} stroke={1.75} aria-hidden />
        </ActionIcon>
      </Group>
    </SelectableRow>
  );
}

// what is inside, asked for once the archive is opened (it needs a child
// for the row to open at all)
function ArchiveMembers({
  file,
  slug,
  selection,
  opened,
}: {
  file: Schemas['FileResponse'];
  slug: string;
  selection: Selection;
  opened: boolean;
}) {
  const { t } = useTranslation(['files', 'file']);
  const members = useQuery({
    ...archiveMembersQuery(file.id),
    enabled: opened,
  });
  const tree = useMemo(
    () => placeMembers(members.data?.members ?? []),
    [members.data],
  );
  return (
    <QueryState
      query={members}
      loading={<ListSkeleton rows={3} label={t('file:members.loading')} />}
      isEmpty={(data) => !data.members.length}
      empty={
        <Text size="sm" c="dimmed" py="xs">
          {t('files:archive.empty')}
        </Text>
      }
    >
      {({ members: all }) => (
        <MembersTree
          node={tree}
          open={all.length <= OPEN_UP_TO}
          slug={slug}
          fileId={file.id}
          selection={selection}
        />
      )}
    </QueryState>
  );
}
