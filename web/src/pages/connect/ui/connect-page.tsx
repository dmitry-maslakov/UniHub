import { Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PageTitle } from '@/shared/ui';
import { ApiKeys } from './api-keys';
import { AppGuides } from './app-guides';
import { ConnectedApps } from './connected-apps';
import { McpAddress } from './mcp-address';

// How an AI app gets in: the hub's address and a guide per app, the apps
// let in, and API keys for the ones that can't sign in
export function ConnectPage() {
  const { t } = useTranslation('connect');
  return (
    <>
      <PageTitle description={t('description')}>{t('title')}</PageTitle>
      <Stack gap="xxl">
        <McpAddress />
        <AppGuides />
        <ConnectedApps />
        <ApiKeys />
      </Stack>
    </>
  );
}
