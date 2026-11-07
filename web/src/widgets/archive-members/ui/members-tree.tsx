import { Anchor, Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Facts,
  FileTypeIcon,
  contentUrl,
  FolderBranch,
  TreeLink,
  fileType,
  filesIn,
  type FolderNode,
} from '@/entities/file';
import { SelectableRow, type Selection } from '@/features/download-selection';
import { useFormat } from '@/shared/i18n';
import { memberName } from '../lib/member-name';
import type { Placed } from '../lib/place-members';
import { targetOf } from '../lib/target-of';
import classes from './members-tree.module.css';

// The folders of an archive's members, then the files in each. A member
// with a text opens to read it; the others can be downloaded or say why
// they weren't kept. Each has a box to tick it, but one left out.
export function MembersTree({
  node,
  open,
  slug,
  fileId,
  selection,
}: {
  node: FolderNode<Placed>;
  open: boolean;
  slug: string;
  fileId: string;
  selection: Selection;
}) {
  const { t } = useTranslation(['file', 'files', 'courses']);
  const { size } = useFormat();
  // each folder's members once, not on every render
  const targets = useMemo(
    () =>
      node.folders.map((f) =>
        filesIn(f).flatMap(({ member }) => targetOf(fileId, member) ?? []),
      ),
    [node, fileId],
  );
  return (
    <>
      {node.folders.map((folder, i) => {
        return (
          <SelectableRow
            key={folder.path}
            label={t('files:selection.selectFolder', { name: folder.name })}
            targets={targets[i]!}
            selection={selection}
          >
            <FolderBranch
              name={folder.name}
              facts={t('courses:files.folderCount', { count: folder.count })}
              open={open}
            >
              <MembersTree
                node={folder}
                open={open}
                slug={slug}
                fileId={fileId}
                selection={selection}
              />
            </FolderBranch>
          </SelectableRow>
        );
      })}
      {node.files.map(({ member }) => {
        const name = memberName(member.path);
        const target = targetOf(fileId, member);
        const meta = [
          size(member.size),
          member.leftOut
            ? t(`file:members.leftOut.${member.leftOut}`)
            : !member.texts.length && t('file:members.noText'),
        ]
          .filter(Boolean)
          .join(' · ');
        const icon = <FileTypeIcon type={fileType(member.mime, name)} />;
        return (
          <SelectableRow
            key={member.path}
            label={t('files:selection.select', { name })}
            targets={target ? [target] : []}
            selection={selection}
          >
            {member.texts.length ? (
              <TreeLink
                to="/courses/$slug/files/$fileId"
                params={{ slug, fileId }}
                search={{ member: member.path }}
                label={name}
                rightSection={<Facts>{meta}</Facts>}
                leftSection={icon}
              />
            ) : (
              <Group className={classes.leaf} wrap="nowrap" gap="sm">
                {icon}
                <div className={classes.leafText}>
                  <Text size="sm">{name}</Text>
                </div>
                <Facts>{meta}</Facts>
                {!member.leftOut && (
                  <Anchor
                    size="sm"
                    href={contentUrl(fileId, { member: member.path })}
                  >
                    {t('file:download')}
                  </Anchor>
                )}
              </Group>
            )}
          </SelectableRow>
        );
      })}
    </>
  );
}
