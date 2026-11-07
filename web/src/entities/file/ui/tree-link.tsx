import { NavLink, type NavLinkProps } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { forwardRef } from 'react';
import classes from './tree.module.css';

// A file of a tree as a typed router link: Mantine's NavLink (the router's
// Custom Link guide), a thumb tall
export const TreeLink = createLink(
  forwardRef<HTMLAnchorElement, Omit<NavLinkProps, 'href'>>((props, ref) => (
    <NavLink
      ref={ref}
      component="a"
      classNames={{
        root: classes.node,
        label: classes.label,
        description: classes.label,
      }}
      {...props}
    />
  )),
);
