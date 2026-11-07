import { SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language } from '@/shared/i18n';

// SR or EN, for pages with no menu to put it in
export function LanguageSwitch() {
  const { t, i18n } = useTranslation('shell');
  const labels: Record<Language, string> = {
    'sr-Latn': t('language.srShort'),
    en: t('language.enShort'),
  };
  return (
    <SegmentedControl
      size="xs"
      aria-label={t('language.label')}
      value={i18n.resolvedLanguage ?? 'en'}
      onChange={(lng) => void i18n.changeLanguage(lng)}
      data={LANGUAGES.map((lng) => ({ value: lng, label: labels[lng] }))}
    />
  );
}
