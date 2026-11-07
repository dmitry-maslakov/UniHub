import { useTranslation } from 'react-i18next';
import { CopyField, Section } from '@/shared/ui';
import { mcpUrl } from '../lib/mcp-url';

// What to give an AI app: this hub's MCP address
export function McpAddress() {
  const { t } = useTranslation('connect');
  return (
    <Section title={t('address.title')} description={t('address.description')}>
      <CopyField label={t('address.label')} value={mcpUrl()} />
    </Section>
  );
}
