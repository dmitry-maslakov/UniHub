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
    <ul className={classes.list} aria-label={label}>
      {children}
    </ul>
  );
}
