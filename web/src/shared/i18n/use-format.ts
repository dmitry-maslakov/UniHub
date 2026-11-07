import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from './instance';

type Value = string | number | Date | null | undefined;

const toDate = (value: Value) =>
  value === null || value === undefined || value === ''
    ? undefined
    : new Date(value);

const UNITS = ['kilobyte', 'megabyte', 'gigabyte'] as const;

// Dates, sizes and counts the way each language writes them; each answers
// nothing for no value
export function formatters(lang: Language | string) {
  const day = new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const dayMonth = new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
  });
  const dayAndTime = new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const number = new Intl.NumberFormat(lang);
  const one = (unit: string) =>
    new Intl.NumberFormat(lang, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });
  const units = UNITS.map(one);
  return {
    date: (value: Value) => {
      const d = toDate(value);
      return d && day.format(d);
    },
    // a day of this year without the year, of another with it
    shortDate: (value: Value, now: Date = new Date()) => {
      const d = toDate(value);
      if (!d) return undefined;
      return (d.getFullYear() === now.getFullYear() ? dayMonth : day).format(d);
    },
    dateTime: (value: Value) => {
      const d = toDate(value);
      return d && dayAndTime.format(d);
    },
    // 1.4 MB, as a file manager says it: base 1000
    size: (bytes: number | null | undefined) => {
      if (bytes === null || bytes === undefined) return undefined;
      if (bytes < 1000) return `${number.format(bytes)} B`;
      let value = bytes / 1000;
      let i = 0;
      // 999.96 kB would round to 1000.0: that is 1.0 MB
      while (i < units.length - 1 && Math.round(value * 10) >= 10_000) {
        value /= 1000;
        i += 1;
      }
      return units[i]!.format(value);
    },
    count: (n: number | null | undefined) =>
      n === null || n === undefined ? undefined : number.format(n),
  };
}

export function useFormat() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  return useMemo(() => formatters(lang), [lang]);
}
