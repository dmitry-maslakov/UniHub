import { Button, Code, CopyButton, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import classes from './api-keys.module.css';

// A key just made: the only time it's ever shown
export function NewKey({
  value,
  onDone,
}: {
  value: string;
  onDone: () => void;
}) {
  return (
    <Stack component="output" gap="sm" className={classes.newKey}>
      <Text fw={600}>Copy your new key now</Text>
      <Text size="sm" c="dimmed">
        You won't be able to see it again. Paste it into your agent's settings.
      </Text>
      <Code block className={classes.secret}>
        {value}
      </Code>
      <Group gap="sm">
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Button
              size="sm"
              onClick={copy}
              leftSection={
                copied ? (
                  <IconCheck size={16} stroke={1.75} />
                ) : (
                  <IconCopy size={16} stroke={1.75} />
                )
              }
            >
              {copied ? 'Copied' : 'Copy key'}
            </Button>
          )}
        </CopyButton>
        <Button size="sm" variant="subtle" color="gray" onClick={onDone}>
          Done
        </Button>
      </Group>
    </Stack>
  );
}
