import { Button, Group, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { authClient, authError } from '@/shared/api';
import { authMessage, safeNext } from '@/shared/lib';
import { AnchorLink, PageTitle } from '@/shared/ui';

const route = getRouteApi('/_auth/check-email');

export function CheckEmailPage() {
  const { t } = useTranslation('auth');
  const { email, next } = route.useSearch();
  const resend = useMutation({
    mutationFn: (to: string) =>
      authClient.sendVerificationEmail({
        email: to,
        callbackURL: safeNext(next),
      }),
  });
  return (
    <>
      <PageTitle>{t('checkEmail.title')}</PageTitle>
      <Stack gap="lg">
        <Text>
          {email ? (
            <Trans
              t={t}
              i18nKey="checkEmail.sent"
              values={{ email }}
              components={{ strong: <strong /> }}
            />
          ) : (
            t('checkEmail.sentNoEmail')
          )}
        </Text>
        <Text c="dimmed" size="sm">
          {t('checkEmail.spam')}
        </Text>
        <Group gap="md">
          {email && (
            <Button
              variant="default"
              loading={resend.isPending}
              disabled={resend.isSuccess}
              onClick={() => resend.mutate(email)}
            >
              {resend.isSuccess
                ? t('checkEmail.resent')
                : t('checkEmail.resend')}
            </Button>
          )}
          <AnchorLink to="/sign-in" search={{ next }}>
            {t('checkEmail.back')}
          </AnchorLink>
        </Group>
        {resend.isError && (
          <Text c="red" size="sm" role="alert">
            {authMessage(authError(resend.error), t('checkEmail.resendFailed'))}
          </Text>
        )}
      </Stack>
    </>
  );
}
