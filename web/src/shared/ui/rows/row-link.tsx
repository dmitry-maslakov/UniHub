import { createLink, type LinkComponent } from '@tanstack/react-router';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import classes from './rows.module.css';

// A row that opens something is a link over the whole row (the router's
// Custom Link guide)
const RowAnchor = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(
  ({ className, children, ...props }, ref) => (
    <a
      ref={ref}
      className={[classes.rowLink, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </a>
  ),
);

const CreatedRowLink = createLink(RowAnchor);

export const RowLink: LinkComponent<typeof RowAnchor> = (props) => (
  <CreatedRowLink preload="intent" {...props} />
);
