import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderBranch,
  fileType,
  filesIn,
  type FolderNode,
} from '@/entities/file';
import { SelectableRow, type Selection } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { targetOf } from '../lib/target-of';
import { ArchiveNode } from './archive-node';
import { FileRow } from './file-row';

type File = Schemas['FileResponse'];

// What of a tree is open: a folder's path or an archive's id, as the
// course remembers them
export interface Opening {
  isOpen: (id: string) => boolean;
  toggle: (id: string, open: boolean) => void;
}

// The folders of a course's files, each opening onto its own, then the
// files that are directly in it, each with a box to tick it. An archive
// with content opens like a folder onto what is inside it.
export function FolderNodeView({
  node,
  slug,
  opening,
  selection,
}: {
  node: FolderNode<File>;
  slug: string;
  opening: Opening;
  selection: Selection;
}) {
  const { t } = useTranslation(['courses', 'files']);
  // each folder's files once, not on every render
  const targets = useMemo(
    () => node.folders.map((f) => filesIn(f).flatMap((x) => targetOf(x) ?? [])),
    [node],
  );
  return (
    <>
      {node.folders.map((folder, i) => (
        <SelectableRow
          key={folder.path}
          label={t('files:selection.selectFolder', { name: folder.name })}
          targets={targets[i]!}
          selection={selection}
        >
          <FolderBranch
            name={folder.name}
            facts={t('courses:files.folderCount', { count: folder.count })}
            open={opening.isOpen(folder.path)}
            onToggle={(open) => opening.toggle(folder.path, open)}
          >
            <FolderNodeView
              node={folder}
              slug={slug}
              opening={opening}
              selection={selection}
            />
          </FolderBranch>
        </SelectableRow>
      ))}
      {node.files.map((file) =>
        file.hasContent && fileType(file.mime, file.name) === 'archive' ? (
          <ArchiveNode
            key={file.id}
            file={file}
            slug={slug}
            open={opening.isOpen(file.id)}
            onToggle={(open) => opening.toggle(file.id, open)}
            selection={selection}
          />
        ) : (
          <FileRow
            key={file.id}
            file={file}
            slug={slug}
            selection={selection}
          />
        ),
      )}
    </>
  );
}
