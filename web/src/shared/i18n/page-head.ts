import { i18n } from './instance';

// a route's document title, in the current language
export const pageHead = (title: () => string) => () => ({
  meta: [{ title: i18n.t('shell:title', { page: title() }) }],
});
