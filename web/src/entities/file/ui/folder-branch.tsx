import { Group, NavLink } from '@mantine/core';
import { IconChevronRight, IconFolder } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Facts } from './facts';
import classes from './tree.module.css';

// A folder of a tree, opening onto what is in it; `open` is how it starts,
// `onToggle` hears each change. An archive is one too, with its own icon.
export function FolderBranch({
  name,
  facts,
  open,
  onToggle,
  icon = <IconFolder size={16} stroke={1.75} aria-hidden />,
  children,
}: {
  name: string;
  facts?: string;
  open: boolean;
  onToggle?: (open: boolean) => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <NavLink
      component="button"
      classNames={{ root: classes.node, label: classes.label }}
      label={name}
      leftSection={icon}
      rightSection={
        <Group component="span" gap={6} wrap="nowrap">
          {facts && <Facts>{facts}</Facts>}
          <IconChevronRight
            className={classes.chevron}
            size={14}
            stroke={1.75}
            aria-hidden
          />
        </Group>
      }
      disableRightSectionRotation
      childrenOffset={20}
      defaultOpened={open}
      onChange={onToggle}
    >
      {children}
    </NavLink>
  );
}
