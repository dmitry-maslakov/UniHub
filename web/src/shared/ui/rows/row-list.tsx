import type { ReactNode } from 'react';
import classes from './rows.module.css';

// A list of rows, never cards: a hairline between them
export function RowList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    // list-style: none makes WebKit drop the list role
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles
    <ul className={classes.list} role="list" aria-label={label}>
      {children}
    </ul>
  );
}
