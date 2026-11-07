import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileTypeIcon,
  FolderBranch,
  TreeLink,
  fileType,
  filesIn,
  type FolderNode,
} from '@/entities/file';
import { SelectableRow, type Selection } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { targetOf } from '../lib/target-of';

type File = Schemas['FileResponse'];

// The folders of a course's files, each opening onto its own, then the
// files that are directly in it, each with a box to tick it; a course with
// many files starts closed
export function FolderNodeView({
  node,
  slug,
  open,
  selection,
}: {
  node: FolderNode<File>;
  slug: string;
  open: boolean;
  selection: Selection;
}) {
  const { t } = useTranslation(['courses', 'files', 'common']);
  const { size } = useFormat();
  // each folder's files once, not on every render
  const targets = useMemo(
    () => node.folders.map((f) => filesIn(f).flatMap((x) => targetOf(x) ?? [])),
    [node],
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
              description={t('courses:files.folderCount', {
                count: folder.count,
              })}
              open={open}
            >
              <FolderNodeView
                node={folder}
                slug={slug}
                open={open}
                selection={selection}
              />
            </FolderBranch>
          </SelectableRow>
        );
      })}
      {node.files.map((file) => {
        const target = targetOf(file);
        return (
          <SelectableRow
            key={file.id}
            label={t('files:selection.select', { name: file.name })}
            targets={target ? [target] : []}
            selection={selection}
          >
            <TreeLink
              to="/courses/$slug/files/$fileId"
              params={{ slug, fileId: file.id }}
              label={file.name}
              description={[
                size(file.size),
                !file.hasContent && t('common:state.notAvailableYet'),
              ]
                .filter(Boolean)
                .join(' · ')}
              leftSection={
                <FileTypeIcon type={fileType(file.mime, file.name)} />
              }
            />
          </SelectableRow>
        );
      })}
    </>
  );
}
