import { Button, Divider, Stack } from '@mantine/core';
import { IconBrandGoogle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { authClient } from '@/shared/api';
import { useSignInMethods } from '../api/use-sign-in-methods';

// "Continue with Google", when the hub has Google set up. Better Auth
// answers with Google's address and its client goes there: the whole page
// leaves, and Google sends the user back to `next`.
export function GoogleSignIn({ next }: { next: string }) {
  const { data } = useSignInMethods();
  const google = useMutation({
    mutationFn: () =>
      authClient.signIn.social({
        provider: 'google',
        callbackURL: next,
        errorCallbackURL: '/sign-in',
      }),
  });
  if (!data?.google) return null;
  return (
    <Stack gap="lg">
      <Button
        variant="default"
        leftSection={<IconBrandGoogle size={18} stroke={1.75} />}
        loading={google.isPending || google.isSuccess}
        onClick={() => google.mutate()}
      >
        Continue with Google
      </Button>
      <Divider label="or with your email" labelPosition="center" />
    </Stack>
  );
}
