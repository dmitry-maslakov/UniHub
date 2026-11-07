import { NavLink } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import classes from './tree.module.css';

// A folder of a tree, opening onto what is in it
export function FolderBranch({
  name,
  description,
  open,
  children,
}: {
  name: string;
  description: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      component="button"
      classNames={{ root: classes.node, label: classes.label }}
      label={name}
      description={description}
      leftSection={<IconFolder size={16} stroke={1.75} aria-hidden />}
      childrenOffset={20}
      defaultOpened={open}
    >
      {children}
    </NavLink>
  );
}
