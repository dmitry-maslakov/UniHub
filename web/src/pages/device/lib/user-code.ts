import type { TFunction } from 'i18next';

// Codes as Better Auth makes them: letters and digits, typed with or without
// the dash or spaces a screen shows them with, in any case
export const normalizeCode = (code: string) =>
  code.replace(/[\s-]/g, '').toUpperCase();

// "ABCDEFGH" as a screen shows it, "ABCD-EFGH"
export const displayCode = (code: string) =>
  code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

// the hub's own apps by their client ids (better-auth.ts, DEVICE_CLIENTS),
// each with the key of the name it is shown by
const apps = {
  'unihub-web': 'app.web',
  'unihub-app': 'app.native',
} as const;

// the app asking, by name: the hub's own in words, another by its client id
export function appName(t: TFunction<'device'>, clientId?: string) {
  if (clientId === undefined) return t('app.other');
  return Object.hasOwn(apps, clientId)
    ? t(apps[clientId as keyof typeof apps])
    : clientId;
}
