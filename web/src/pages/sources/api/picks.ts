import { fetchClient } from '@/shared/api';

// a course of a public portal's catalog picked, or no longer
export const setPicked = (
  portal: string,
  externalId: string,
  pick: boolean,
) => {
  const init = { params: { path: { portal, externalId } } };
  return pick
    ? fetchClient.PUT('/api/me/picks/{portal}/{externalId}', init)
    : fetchClient.DELETE('/api/me/picks/{portal}/{externalId}', init);
};
