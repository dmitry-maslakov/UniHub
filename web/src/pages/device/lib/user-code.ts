// Codes as Better Auth makes them: letters and digits, typed with or without
// the dash or spaces a screen shows them with, in any case
export const normalizeCode = (code: string) =>
  code.replace(/[\s-]/g, '').toUpperCase();

// "ABCDEFGH" as a screen shows it, "ABCD-EFGH"
export const displayCode = (code: string) =>
  code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

// the hub's own apps by their client ids (better-auth.ts, DEVICE_CLIENTS)
const apps: Record<string, string> = {
  'unihub-web': 'UniHub in a browser',
  'unihub-app': 'the UniHub app',
};
export const appName = (clientId?: string) =>
  (clientId && apps[clientId]) ?? clientId ?? 'An app';
