import { Button, type ButtonProps, Divider, Stack } from '@mantine/core';
import { IconDeviceMobile } from '@tabler/icons-react';
import { createLink } from '@tanstack/react-router';
import { forwardRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleSignIn, useSignInMethods } from '@/features/sign-in-with-google';

// Mantine's Button as a typed router link (the router's Custom Link guide)
const MantineButtonLink = forwardRef<
  HTMLAnchorElement,
  Omit<ButtonProps, 'href'> & { children?: ReactNode }
>((props, ref) => <Button component="a" ref={ref} {...props} />);

const ButtonLink = createLink(MantineButtonLink);

// The ways in but a password: Google when the hub has it, and a phone that
// is signed in already (not for an AI app's sign-in, which has its own end)
export function OtherWays({ next, phone }: { next: string; phone: boolean }) {
  const { t } = useTranslation('auth');
  const { data } = useSignInMethods();
  const google = !!data?.google;
  if (!google && !phone) return null;
  return (
    <>
      <Stack gap="sm">
        {google && <GoogleSignIn next={next} />}
        {phone && (
          <ButtonLink
            to="/sign-in/phone"
            search={{ next }}
            variant="default"
            fullWidth
            leftSection={<IconDeviceMobile size={18} stroke={1.75} />}
          >
            {t('signIn.withPhone')}
          </ButtonLink>
        )}
      </Stack>
      <Divider label={t('signIn.orEmail')} labelPosition="center" />
    </>
  );
}
