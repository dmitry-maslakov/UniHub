import { Button, Code, CopyButton, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

// A value to copy, such as an address or a command, with a button to do it
export function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation('common');
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <Group wrap="nowrap" gap="sm" align="flex-start">
        <Code block style={{ flex: 1, overflowWrap: 'anywhere' }}>
          {value}
        </Code>
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Button
              variant="default"
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
              {copied ? t('action.copied') : t('action.copy')}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Stack>
  );
}
