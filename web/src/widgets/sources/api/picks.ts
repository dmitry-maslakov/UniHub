import { fetchClient } from '@/shared/api';

const course = (portal: string, externalId: string) => ({
  params: { path: { portal, externalId } },
});

// a course of a public portal's catalog picked, or no longer
export const setPicked = (portal: string, externalId: string, pick: boolean) =>
  pick
    ? fetchClient.PUT(
        '/api/me/picks/{portal}/{externalId}',
        course(portal, externalId),
      )
    : fetchClient.DELETE(
        '/api/me/picks/{portal}/{externalId}',
        course(portal, externalId),
      );

// a picked course shown with a course of the user's own, by its slug, or
// on its own (null)
export const showWith = (
  portal: string,
  externalId: string,
  into: string | null,
) =>
  fetchClient.PUT('/api/me/picks/{portal}/{externalId}', {
    ...course(portal, externalId),
    body: { into },
  });
