import { Anchor, type AnchorProps } from '@mantine/core';
import { createLink, type LinkComponent } from '@tanstack/react-router';
import { forwardRef, type ReactNode } from 'react';

// Mantine's Anchor as a typed router link (the router's Custom Link guide)
interface MantineAnchorProps extends Omit<AnchorProps, 'href'> {
  children?: ReactNode;
}

const MantineLinkComponent = forwardRef<HTMLAnchorElement, MantineAnchorProps>(
  (props, ref) => <Anchor ref={ref} {...props} />,
);

const CreatedLinkComponent = createLink(MantineLinkComponent);

export const AnchorLink: LinkComponent<typeof MantineLinkComponent> = (
  props,
) => <CreatedLinkComponent preload="intent" {...props} />;
