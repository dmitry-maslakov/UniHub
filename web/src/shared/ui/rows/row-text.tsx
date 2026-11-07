import { Group, Stack, Text } from '@mantine/core';
import { Fragment, type ReactNode } from 'react';
import classes from './rows.module.css';

// A row's words: its title (with badges after it) and one dimmed line of
// the parts of `meta` that there are, joined by " · "
export function RowText({
  title,
  meta,
  badges,
}: {
  title: ReactNode;
  meta?: (ReactNode | null | undefined | false)[];
  badges?: ReactNode;
}) {
  const parts = meta?.filter(Boolean) ?? [];
  return (
    <Stack gap={2} miw={0} style={{ flex: '1 1 14rem' }}>
      <Group gap="xs" wrap="wrap">
        <Text fw={600} className={classes.title}>
          {title}
        </Text>
        {badges}
      </Group>
      {parts.length > 0 && (
        <Text size="sm" c="dimmed">
          {parts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              {part}
            </Fragment>
          ))}
        </Text>
      )}
    </Stack>
  );
}
