import { SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { FilesView } from '../model/search';

// The Files tab's two ways to list them
export function FilesViewSwitch({
  value,
  onChange,
}: {
  value: FilesView;
  onChange: (view: FilesView) => void;
}) {
  const { t } = useTranslation('courses');
  return (
    <SegmentedControl
      size="sm"
      aria-label={t('files.view.label')}
      value={value}
      onChange={(next) => onChange(next === 'newest' ? 'newest' : 'folders')}
      data={[
        { value: 'folders', label: t('files.view.folders') },
        { value: 'newest', label: t('files.view.newest') },
      ]}
    />
  );
}
