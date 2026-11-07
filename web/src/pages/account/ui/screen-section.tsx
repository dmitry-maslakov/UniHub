import { useTranslation } from 'react-i18next';
import { AnchorLink, Section } from '@/shared/ui';

// Approving another screen's sign-in from here, by its code
export function ScreenSection() {
  const { t } = useTranslation('account');
  return (
    <Section title={t('screen.title')} description={t('screen.description')}>
      <AnchorLink to="/device">{t('screen.action')}</AnchorLink>
    </Section>
  );
}
