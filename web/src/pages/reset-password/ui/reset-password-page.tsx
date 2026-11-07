import { Alert, Stack } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageTitle } from '@/shared/ui';
import { NewPasswordForm } from './new-password-form';
import { RequestResetForm } from './request-reset-form';

const route = getRouteApi('/_auth/reset-password');

// Both halves of a reset: asking for the mail, and the page its link opens
export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const { token, error } = route.useSearch();
  if (token && !error)
    return (
      <>
        <PageTitle description={t('newPassword.description')}>
          {t('newPassword.title')}
        </PageTitle>
        <NewPasswordForm token={token} />
      </>
    );
  return (
    <>
      <PageTitle description={t('reset.description')}>
        {t('reset.title')}
      </PageTitle>
      <Stack gap="lg">
        {error && (
          <Alert color="red" role="alert">
            {t('reset.expired')}
          </Alert>
        )}
        <RequestResetForm />
      </Stack>
    </>
  );
}
