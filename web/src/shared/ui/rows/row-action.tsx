import { Box } from '@mantine/core';
import type { ReactNode } from 'react';

// A row's one action, kept its own size beside the text
export function RowAction({ children }: { children: ReactNode }) {
  return <Box style={{ flex: 'none' }}>{children}</Box>;
}
