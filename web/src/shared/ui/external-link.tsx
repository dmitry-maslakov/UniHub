import { Button } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import type { ReactNode } from 'react';

// A button that opens another site in a new tab
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Button
      component="a"
      variant="default"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      rightSection={<IconExternalLink size={16} stroke={1.75} />}
    >
      {children}
    </Button>
  );
}
