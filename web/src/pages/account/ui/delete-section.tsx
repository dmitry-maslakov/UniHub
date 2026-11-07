import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { Section } from '@/shared/ui';
import { DeleteAccountModal } from './delete-account-modal';

// The way out for good, behind a confirm that says what goes
export function DeleteSection() {
  const { t } = useTranslation('account');
  const [opened, { open, close }] = useDisclosure(false);
  return (
    <Section title={t('delete.title')} description={t('delete.description')}>
      <Button variant="subtle" color="red" w="fit-content" onClick={open}>
        {t('delete.open')}
      </Button>
      <DeleteAccountModal opened={opened} onClose={close} />
    </Section>
  );
}
