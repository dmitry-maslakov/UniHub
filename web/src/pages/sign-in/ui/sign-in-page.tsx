import { Alert, Stack, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { safeNext } from '@/shared/lib';
import { AnchorLink, PageTitle } from '@/shared/ui';
import { OtherWays } from './other-ways';
import { SignInForm } from './sign-in-form';

const route = getRouteApi('/_auth/sign-in');

export function SignInPage() {
  const { t } = useTranslation('auth');
  const search = route.useSearch();
  const next = safeNext(search.next);
  return (
    <>
      <PageTitle description={t('signIn.description')}>
        {t('signIn.title')}
      </PageTitle>
      <Stack gap="lg">
        {search.error && (
          <Alert color="red" role="alert">
            {t('signIn.googleFailed')}
          </Alert>
        )}
        <OtherWays next={next} phone={!search.sig} />
        <SignInForm next={next} />
      </Stack>
      <Text ta="center" size="sm" c="dimmed" mt="xl">
        {t('signIn.newHere')}{' '}
        <AnchorLink to="/sign-up" search={(prev) => prev}>
          {t('signIn.createAccount')}
        </AnchorLink>
      </Text>
    </>
  );
}
