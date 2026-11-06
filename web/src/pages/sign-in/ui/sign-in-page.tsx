import { Alert, Stack, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { GoogleSignIn } from '@/features/sign-in-with-google';
import { safeNext } from '@/shared/lib';
import { AnchorLink, PageTitle } from '@/shared/ui';
import { SignInForm } from './sign-in-form';

const route = getRouteApi('/_auth/sign-in');

export function SignInPage() {
  const search = route.useSearch();
  const next = safeNext(search.next);
  return (
    <>
      <PageTitle description="Your courses, their posts and files, and the keys your AI agents read them with.">
        Sign in to UniHub
      </PageTitle>
      <Stack gap="lg">
        {search.error && (
          <Alert color="red" role="alert">
            Signing in with Google didn't finish. Try again, or use your email.
          </Alert>
        )}
        <GoogleSignIn next={next} />
        <SignInForm next={next} />
      </Stack>
      <Text ta="center" size="sm" c="dimmed" mt="xl">
        New to UniHub?{' '}
        <AnchorLink to="/sign-up" search={(prev) => prev}>
          Create an account
        </AnchorLink>
      </Text>
    </>
  );
}
