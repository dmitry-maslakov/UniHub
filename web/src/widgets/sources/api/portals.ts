import { fetchClient } from '@/shared/api';

// The token goes from the field to the request and no further: no form
// state, no mutation variables, nothing for a cache or a log to keep
export const putToken = (portal: string, token: string) =>
  fetchClient.PUT('/api/me/portals/{portal}/token', {
    params: { path: { portal } },
    body: { token },
  });

export const deleteToken = (portal: string) =>
  fetchClient.DELETE('/api/me/portals/{portal}/token', {
    params: { path: { portal } },
  });
