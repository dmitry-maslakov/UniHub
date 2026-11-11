import type { ReactNode } from 'react';
import classes from './rows.module.css';

// One row of a RowList: its text on the left, at most one action on the
// right, which wraps under the text on a narrow screen, or stays beside a
// row that is a link
export function Row({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <li className={classes.row} id={id}>
      {children}
    </li>
  );
}
