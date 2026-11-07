import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Selection } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { newestFirst } from '../lib/newest-first';
import { FileRow } from './file-row';

// Every file of the course in one list, newest first by its date on its
// portal, the undated last, each with its folder
export function NewestFiles({
  files,
  slug,
  selection,
}: {
  files: readonly Schemas['FileResponse'][];
  slug: string;
  selection: Selection;
}) {
  const { t } = useTranslation('courses');
  const sorted = useMemo(() => newestFirst(files), [files]);
  return (
    <nav aria-label={t('files.newest.aria')}>
      {sorted.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          slug={slug}
          selection={selection}
          folder
        />
      ))}
    </nav>
  );
}
