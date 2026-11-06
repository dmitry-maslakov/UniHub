import { Stack, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { GoogleSignIn } from '@/features/sign-in-with-google';
import { safeNext } from '@/shared/lib';
import { AnchorLink, PageTitle } from '@/shared/ui';
import { SignUpForm } from './sign-up-form';

const route = getRouteApi('/_auth/sign-up');

export function SignUpPage() {
  const search = route.useSearch();
  const next = safeNext(search.next);
  return (
    <>
      <PageTitle description="One place for the posts and files of all your courses, for you and your AI agents.">
        Create your account
      </PageTitle>
      <Stack gap="lg">
        <GoogleSignIn next={next} />
        <SignUpForm next={next} />
      </Stack>
      <Text ta="center" size="sm" c="dimmed" mt="xl">
        Already have an account?{' '}
        <AnchorLink to="/sign-in" search={(prev) => prev}>
          Sign in
        </AnchorLink>
      </Text>
    </>
  );
}
