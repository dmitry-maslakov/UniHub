import { Anchor, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  FileTypeIcon,
  contentUrl,
  FolderBranch,
  TreeLink,
  fileType,
  filesIn,
  type FolderNode,
} from '@/entities/file';
import {
  SelectableRow,
  boxState,
  type Selection,
} from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { memberName } from '../lib/member-name';
import { targetOf } from '../lib/target-of';
import classes from './file.module.css';

export type Member = Schemas['MemberResponse'];
// a member in its folder of the archive's tree
export interface Placed {
  member: Member;
  path: string;
}

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
  return (
    <>
      {node.folders.map((folder) => {
        const targets = filesIn(folder).flatMap(
          ({ member }) => targetOf(fileId, member) ?? [],
        );
        return (
          <SelectableRow
            key={folder.path}
            label={t('files:selection.selectFolder', { name: folder.name })}
            state={boxState(targets, selection.has)}
            onChange={(on) => selection.setMany(targets, on)}
          >
            <FolderBranch
              name={folder.name}
              description={t('courses:files.folderCount', {
                count: folder.count,
              })}
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
            state={target && boxState([target], selection.has)}
            onChange={() => target && selection.toggle(target)}
          >
            {member.texts.length ? (
              <TreeLink
                to="/courses/$slug/files/$fileId"
                params={{ slug, fileId }}
                search={{ member: member.path }}
                label={name}
                description={meta}
                leftSection={icon}
              />
            ) : (
              <Group className={classes.leaf} wrap="nowrap" gap="sm">
                {icon}
                <div className={classes.leafText}>
                  <Text size="sm">{name}</Text>
                  <Text size="xs" c="dimmed">
                    {meta}
                  </Text>
                </div>
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
