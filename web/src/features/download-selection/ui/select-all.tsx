import { Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { boxState, type Selection, type Target } from '../model/selection';

// One box for everything that can be ticked on the page
export function SelectAll({
  targets,
  selection,
}: {
  targets: readonly Target[];
  selection: Selection;
}) {
  const { t } = useTranslation('files');
  const state = boxState(targets, selection.has);
  if (!state) return null;
  return (
    <Checkbox
      size="sm"
      label={t('selection.selectAll')}
      checked={state.checked}
      indeterminate={state.indeterminate}
      onChange={(event) =>
        selection.setMany(targets, event.currentTarget.checked)
      }
    />
  );
}
