import { Button, Code, CopyButton, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import classes from './new-key.module.css';

// A key just made: the only time it's ever shown
export function NewKey({
  value,
  onDone,
}: {
  value: string;
  onDone: () => void;
}) {
  const { t } = useTranslation(['connect', 'common']);
  return (
    <Stack component="output" gap="sm" className={classes.newKey}>
      <Text fw={600}>{t('keys.created.title')}</Text>
      <Text size="sm" c="dimmed">
        {t('keys.created.body')}
      </Text>
      <Code block className={classes.secret}>
        {value}
      </Code>
      <Group gap="sm">
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Button
              size="sm"
              variant="default"
              onClick={copy}
              leftSection={
                copied ? (
                  <IconCheck size={16} stroke={1.75} />
                ) : (
                  <IconCopy size={16} stroke={1.75} />
                )
              }
            >
              {copied ? t('common:action.copied') : t('keys.created.copy')}
            </Button>
          )}
        </CopyButton>
        <Button size="sm" variant="subtle" color="gray" onClick={onDone}>
          {t('common:action.done')}
        </Button>
      </Group>
    </Stack>
  );
}
