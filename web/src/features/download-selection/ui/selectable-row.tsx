import { Checkbox, Group } from '@mantine/core';
import type { ReactNode } from 'react';
import type { BoxState } from '../model/selection';
import classes from './selection.module.css';

// A row of a tree with its box beside it, never inside its link. A row with
// nothing to tick (`state` null) keeps the place of a box.
export function SelectableRow({
  label,
  state,
  onChange,
  children,
}: {
  label: string;
  state: BoxState | null;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Group wrap="nowrap" gap="xs" align="flex-start">
      <div className={classes.slot}>
        {state && (
          <Checkbox
            size="sm"
            aria-label={label}
            checked={state.checked}
            indeterminate={state.indeterminate}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
        )}
      </div>
      <div className={classes.body}>{children}</div>
    </Group>
  );
}
