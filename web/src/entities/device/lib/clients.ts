// the web app's own sign-in by QR (better-auth.ts, WEB_DEVICE_CLIENT): its
// screen gets the session as a cookie
export const WEB_DEVICE_CLIENT = 'unihub-web';

// the hub's own apps by their client ids (better-auth.ts, DEVICE_CLIENTS)
const keys: Record<string, 'web' | 'native'> = {
  [WEB_DEVICE_CLIENT]: 'web',
  'unihub-app': 'native',
};

// the key of the name an app is shown by, `device:app.<key>`; any other
// client is just "an app" (a client id says nothing to a person)
export const appKey = (clientId?: string): 'web' | 'native' | 'other' =>
  (clientId !== undefined && Object.hasOwn(keys, clientId)
    ? keys[clientId]
    : undefined) ?? 'other';
