import { Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OPEN_UP_TO, folderTree } from '@/entities/file';
import {
  SelectAll,
  SelectionBar,
  useSelection,
} from '@/features/download-selection';
import { ListSkeleton, QueryState, Section } from '@/shared/ui';
import { archiveMembersQuery } from '../api/archive-members';
import { memberFolder } from '../lib/member-name';
import { targetOf } from '../lib/target-of';
import { MembersTree } from './members-tree';

// The files inside an archive as the folders they sit in, with a box beside
// each to download several at once. Nothing for an archive that holds none.
export function MembersSection({
  fileId,
  slug,
}: {
  fileId: string;
  slug: string;
}) {
  const { t } = useTranslation(['file', 'courses']);
  const members = useQuery(archiveMembersQuery(fileId));
  const targets = useMemo(
    () =>
      (members.data?.members ?? []).flatMap(
        (member) => targetOf(fileId, member) ?? [],
      ),
    [fileId, members.data],
  );
  const selection = useSelection(targets);
  const tree = useMemo(
    () =>
      folderTree(
        (members.data?.members ?? []).map((member) => ({
          member,
          path: memberFolder(member.path),
        })),
      ),
    [members.data],
  );

  return (
    <QueryState
      query={members}
      loading={<ListSkeleton rows={3} label={t('file:members.loading')} />}
      isEmpty={(data) => !data.members.length}
      empty={null}
    >
      {({ members: all, capped }) => (
        <Section
          title={t('file:members.title')}
          description={t('file:members.description')}
        >
          <Stack gap="sm">
            <SelectAll targets={targets} selection={selection} />
            <nav aria-label={t('file:members.aria')}>
              <MembersTree
                node={tree}
                open={all.length <= OPEN_UP_TO}
                slug={slug}
                fileId={fileId}
                selection={selection}
              />
            </nav>
            {capped && (
              <Text size="sm" c="dimmed">
                {t('courses:files.capped')}
              </Text>
            )}
            <SelectionBar selection={selection} />
          </Stack>
        </Section>
      )}
    </QueryState>
  );
}
