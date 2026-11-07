import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

// What a tree row says about itself, on its right and on one line
export function Facts({ children }: { children: ReactNode }) {
  return (
    <Text
      component="span"
      size="xs"
      c="dimmed"
      style={{ whiteSpace: 'nowrap' }}
    >
      {children}
    </Text>
  );
}
