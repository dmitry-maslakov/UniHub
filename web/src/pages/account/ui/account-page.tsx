import { Button, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSession, useSessionActions } from '@/entities/session';
import { AnchorLink, PageTitle, Section } from '@/shared/ui';

export function AccountPage() {
  const { t } = useTranslation('account');
  const { user } = useSession();
  const { signOut } = useSessionActions();
  return (
    <>
      <PageTitle description={user.email}>{user.name}</PageTitle>
      <Stack gap="xxl">
        <Section
          title={t('screen.title')}
          description={t('screen.description')}
        >
          <AnchorLink to="/device">{t('screen.action')}</AnchorLink>
        </Section>
        <Section
          title={t('signOut.title')}
          description={t('signOut.description')}
        >
          <Button
            variant="default"
            w="fit-content"
            onClick={() => void signOut()}
          >
            {t('signOut.action')}
          </Button>
        </Section>
      </Stack>
    </>
  );
}
