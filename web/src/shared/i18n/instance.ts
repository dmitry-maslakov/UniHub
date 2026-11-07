import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { namespaces, resources } from './resources';

export const LANGUAGES = ['sr-Latn', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

// A browser's Serbian, in either script and any region, and Serbo-Croatian
// read the Latin translation; anything else by its language alone
export const toSupported = (tag: string) =>
  /^(sr|sh)(-|$)/i.test(tag) ? 'sr-Latn' : tag.split('-')[0]!.toLowerCase();

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: namespaces,
    defaultNS: 'common',
    supportedLngs: [...LANGUAGES],
    fallbackLng: 'en',
    load: 'currentOnly',
    initAsync: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'unihub.language',
      caches: ['localStorage'],
      convertDetectedLanguage: toSupported,
    },
    react: { useSuspense: false },
  });

const setLang = (lng: string) =>
  document.documentElement.setAttribute('lang', lng);
setLang(i18n.resolvedLanguage ?? 'en');
i18n.on('languageChanged', setLang);

export { i18n };
