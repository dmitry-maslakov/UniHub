import { Checkbox, Group } from '@mantine/core';
import type { ReactNode } from 'react';
import { useBox, type Selection, type Target } from '../model/selection';
import classes from './selection.module.css';

// A row of a tree with its box beside it, never inside its link, over the
// `targets` it ticks. A row with none keeps the place of a box.
export function SelectableRow({
  label,
  targets,
  selection,
  children,
}: {
  label: string;
  targets: readonly Target[];
  selection: Selection;
  children: ReactNode;
}) {
  const state = useBox(selection, targets);
  return (
    <Group wrap="nowrap" gap="xs" align="flex-start">
      <div className={classes.slot}>
        {state && (
          <Checkbox
            size="sm"
            aria-label={label}
            checked={state.checked}
            indeterminate={state.indeterminate}
            onChange={(event) =>
              selection.setMany(targets, event.currentTarget.checked)
            }
          />
        )}
      </div>
      <div className={classes.body}>{children}</div>
    </Group>
  );
}
