import { Button } from '@mantine/core';
import { IconBrandGoogle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/shared/api';

// "Continue with Google". Better Auth answers with Google's address and its
// client goes there: the whole page leaves, and Google sends the user back
// to `next`. Whether the hub has Google set up is `useSignInMethods`.
export function GoogleSignIn({ next }: { next: string }) {
  const { t } = useTranslation('auth');
  const google = useMutation({
    mutationFn: () =>
      authClient.signIn.social({
        provider: 'google',
        callbackURL: next,
        errorCallbackURL: '/sign-in',
      }),
  });
  return (
    <Button
      variant="default"
      fullWidth
      leftSection={<IconBrandGoogle size={18} stroke={1.75} />}
      loading={google.isPending || google.isSuccess}
      onClick={() => google.mutate()}
    >
      {t('google.action')}
    </Button>
  );
}
