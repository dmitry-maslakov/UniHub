import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { folderTree } from '@/entities/file';
import type { Selection } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { useOpenFolders } from '../model/open-folders';
import { FolderNodeView } from './folder-node';

// A course's files as the folders they sit in. What is open is read once
// when the tree appears and kept per course as it is opened and closed.
export function FolderTree({
  files,
  slug,
  selection,
}: {
  files: readonly Schemas['FileResponse'][];
  slug: string;
  selection: Selection;
}) {
  const { t } = useTranslation('courses');
  const tree = useMemo(() => folderTree(files), [files]);
  const opening = useOpenFolders(
    slug,
    tree.folders.map((folder) => folder.path),
  );
  return (
    <nav aria-label={t('files.aria')}>
      <FolderNodeView
        node={tree}
        slug={slug}
        opening={opening}
        selection={selection}
      />
    </nav>
  );
}
