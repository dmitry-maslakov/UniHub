import {
  Alert,
  Button,
  Group,
  Loader,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DeviceCode, normalizeCode } from '@/entities/device';
import { safeNext } from '@/shared/lib';
import { AnchorLink, ErrorState, PageTitle, TextSkeleton } from '@/shared/ui';
import { typedAddress } from '../lib/address';
import { usePhoneSignIn } from '../model/use-phone-sign-in';
import { QrTile } from './qr-tile';

const route = getRouteApi('/_auth/sign-in_/phone');

// This screen asks for a code and shows it as a QR code; a phone that is
// signed in approves it, and this screen is signed in too
export function SignInPhonePage() {
  const { t } = useTranslation(['auth', 'common']);
  const { next } = route.useSearch();
  const target = safeNext(next);
  const { code, status, newCode } = usePhoneSignIn(target);

  const newCodeButton = (
    <Button w="fit-content" onClick={newCode}>
      {t('phone.newCode')}
    </Button>
  );

  return (
    <>
      <PageTitle description={t('phone.description')}>
        {t('phone.title')}
      </PageTitle>
      <Stack gap="lg">
        {code.isPending && (
          <>
            <Skeleton w={240} h={240} radius="lg" mx="auto" aria-hidden />
            <TextSkeleton lines={2} label={t('common:state.loading')} />
          </>
        )}
        {code.isError && <ErrorState error={code.error} onRetry={newCode} />}
        {code.data &&
          (status === undefined ||
            status === 'pending' ||
            status === 'slowDown') && (
            <>
              <QrTile value={code.data.verification_uri_complete} />
              <Text size="sm" c="dimmed">
                {t('phone.orType', {
                  address: typedAddress(code.data.verification_uri),
                })}
              </Text>
              <DeviceCode code={normalizeCode(code.data.user_code)} />
              <Text component="output" size="sm" c="dimmed">
                {t('phone.waiting', {
                  minutes: Math.round(code.data.expires_in / 60),
                })}
              </Text>
            </>
          )}
        {status === 'approved' && (
          <Group gap="sm">
            <Loader size="sm" />
            <Text component="output">{t('phone.approved')}</Text>
          </Group>
        )}
        {status === 'denied' && (
          <>
            <Alert color="red" role="alert">
              {t('phone.denied')}
            </Alert>
            {newCodeButton}
          </>
        )}
        {status === 'expired' && (
          <>
            <Text>{t('phone.expired')}</Text>
            {newCodeButton}
          </>
        )}
        {status === 'failed' && (
          <ErrorState error={undefined} onRetry={newCode} />
        )}
        <AnchorLink to="/sign-in" search={{ next }} size="sm" ta="center">
          {t('phone.withEmail')}
        </AnchorLink>
      </Stack>
    </>
  );
}
