import { List, Stack, Tabs, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { CopyField, Section } from '@/shared/ui';
import { claudeCodeCommand, mcpUrl } from '../lib/mcp-url';

// How each AI app takes the address: a minute's steps for Claude, ChatGPT
// and Claude Code
export function AppGuides() {
  const { t } = useTranslation('connect');
  return (
    <Section title={t('guides.title')} description={t('guides.description')}>
      <Tabs defaultValue="claude" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="claude">{t('guides.claude.tab')}</Tabs.Tab>
          <Tabs.Tab value="chatgpt">{t('guides.chatgpt.tab')}</Tabs.Tab>
          <Tabs.Tab value="claudeCode">{t('guides.claudeCode.tab')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="claude" pt="md">
          <List type="ordered" spacing="xs" size="sm">
            <List.Item>{t('guides.claude.step1')}</List.Item>
            <List.Item>{t('guides.claude.step2')}</List.Item>
            <List.Item>{t('guides.claude.step3')}</List.Item>
            <List.Item>{t('guides.claude.step4')}</List.Item>
          </List>
        </Tabs.Panel>
        <Tabs.Panel value="chatgpt" pt="md">
          <List type="ordered" spacing="xs" size="sm">
            <List.Item>{t('guides.chatgpt.step1')}</List.Item>
            <List.Item>{t('guides.chatgpt.step2')}</List.Item>
            <List.Item>{t('guides.chatgpt.step3')}</List.Item>
          </List>
        </Tabs.Panel>
        <Tabs.Panel value="claudeCode" pt="md">
          <Stack gap="sm">
            <Text size="sm">{t('guides.claudeCode.step1')}</Text>
            <CopyField
              label={t('guides.claudeCode.label')}
              value={claudeCodeCommand(mcpUrl())}
            />
            <Text size="sm">{t('guides.claudeCode.step2')}</Text>
          </Stack>
        </Tabs.Panel>
      </Tabs>
      <Text size="sm" c="dimmed">
        {t('guides.other')}
      </Text>
    </Section>
  );
}
