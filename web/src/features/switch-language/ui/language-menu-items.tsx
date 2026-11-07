import { Menu } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/shared/i18n';

// The languages as items of a menu, the current one checked
export function LanguageMenuItems() {
  const { t, i18n } = useTranslation('shell');
  return LANGUAGES.map((lng) => {
    const current = i18n.resolvedLanguage === lng;
    return (
      <Menu.Item
        key={lng}
        aria-current={current ? 'true' : undefined}
        lang={lng}
        rightSection={current ? <IconCheck size={16} stroke={1.75} /> : null}
        onClick={() => void i18n.changeLanguage(lng)}
      >
        {t(lng === 'en' ? 'language.en' : 'language.sr')}
      </Menu.Item>
    );
  });
}
