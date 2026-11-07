import { WEB_DEVICE_CLIENT } from '@/entities/device';
import { authClient, authError } from '@/shared/api';
import { pollStatus } from '../lib/poll-status';

// a code for this screen to show: { device_code, user_code,
// verification_uri, verification_uri_complete, expires_in, interval }
export const requestCode = () =>
  authClient.device.code({ client_id: WEB_DEVICE_CLIENT });

// Asks whether a phone approved the code. Approved, the answer carries the
// session as a cookie (better-auth.ts); anything else is Better Auth's
// refusal, read as a status.
export const pollToken = (deviceCode: string) =>
  authClient.device
    .token({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: WEB_DEVICE_CLIENT,
    })
    .then(
      () => 'approved' as const,
      (error: unknown) => pollStatus(authError(error)?.code),
    );
