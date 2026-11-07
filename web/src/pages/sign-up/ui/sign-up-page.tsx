import { Divider, Stack, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { GoogleSignIn, useSignInMethods } from '@/features/sign-in-with-google';
import { safeNext } from '@/shared/lib';
import { AnchorLink, PageTitle } from '@/shared/ui';
import { SignUpForm } from './sign-up-form';

const route = getRouteApi('/_auth/sign-up');

export function SignUpPage() {
  const { t } = useTranslation('auth');
  const search = route.useSearch();
  const next = safeNext(search.next);
  const { data } = useSignInMethods();
  return (
    <>
      <PageTitle description={t('signUp.description')}>
        {t('signUp.title')}
      </PageTitle>
      <Stack gap="lg">
        {data?.google && (
          <>
            <GoogleSignIn next={next} />
            <Divider label={t('signIn.orEmail')} labelPosition="center" />
          </>
        )}
        <SignUpForm next={next} />
      </Stack>
      <Text ta="center" size="sm" c="dimmed" mt="xl">
        {t('signUp.haveAccount')}{' '}
        <AnchorLink to="/sign-in" search={(prev) => prev}>
          {t('signUp.signIn')}
        </AnchorLink>
      </Text>
    </>
  );
}
