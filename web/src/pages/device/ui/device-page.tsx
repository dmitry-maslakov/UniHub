import { Box } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { normalizeCode } from '@/entities/device';
import { PageTitle } from '@/shared/ui';
import { CodeForm } from './code-form';
import { DeviceRequestView } from './device-request-view';

const route = getRouteApi('/_app/device');

// A screen signing in by QR code: approved or denied from here
export function DevicePage() {
  const { t } = useTranslation('device');
  const { user_code } = route.useSearch();
  const code = user_code ? normalizeCode(user_code) : undefined;
  return (
    <Box maw="25rem">
      <PageTitle
        description={code ? t('approve.description') : t('description')}
      >
        {code ? t('approve.title') : t('title')}
      </PageTitle>
      {code ? <DeviceRequestView key={code} code={code} /> : <CodeForm />}
    </Box>
  );
}
