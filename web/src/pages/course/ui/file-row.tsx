import { useTranslation } from 'react-i18next';
import { Facts, FileTypeIcon, TreeLink, fileType } from '@/entities/file';
import { SelectableRow, type Selection } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { targetOf } from '../lib/target-of';

// A file of the course as a row with its box: the link to its page, then
// its size and date. In a flat list (`folder`) its folder is under its name.
export function FileRow({
  file,
  slug,
  selection,
  folder = false,
}: {
  file: Schemas['FileResponse'];
  slug: string;
  selection: Selection;
  folder?: boolean;
}) {
  const { t } = useTranslation(['files', 'common']);
  const { size, shortDate } = useFormat();
  const target = targetOf(file);
  const facts = [
    size(file.size),
    shortDate(file.changedAt),
    !file.hasContent && t('common:state.notAvailableYet'),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <SelectableRow
      label={t('files:selection.select', { name: file.name })}
      targets={target ? [target] : []}
      selection={selection}
    >
      <TreeLink
        to="/courses/$slug/files/$fileId"
        params={{ slug, fileId: file.id }}
        label={file.name}
        description={folder ? file.path || undefined : undefined}
        rightSection={<Facts>{facts}</Facts>}
        leftSection={<FileTypeIcon type={fileType(file.mime, file.name)} />}
      />
    </SelectableRow>
  );
}
