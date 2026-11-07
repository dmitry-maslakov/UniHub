import { Loader, Text } from '@mantine/core';
import { api } from '@/shared/api';
import { PortalCatalog } from './portal-catalog';
import { PortalRow } from './portal-row';
import classes from './sources.module.css';

// The portals the hub reads courses from, each with what the user does
// there: a token portal's account to link, a public one's catalog to pick
// from, a shared one's word that there's nothing to do
export function SourceCards() {
  const portals = api.useQuery('get', '/api/me/portals');
  return (
    <>
      {portals.isPending && (
        <Loader size="sm" aria-label="Loading your portals" />
      )}
      {portals.isError && (
        <Text c="red" role="alert">
          Couldn't load your portals. Reload the page to try again.
        </Text>
      )}
      {portals.data && !portals.data.length && (
        <Text c="dimmed">No portals are set up on this hub yet.</Text>
      )}
      {portals.data && portals.data.length > 0 && (
        <ul className={classes.list} aria-label="Portals">
          {portals.data.map((portal) =>
            portal.mode === 'public' ? (
              <li key={portal.portal} className={classes.row}>
                <PortalCatalog portal={portal} />
              </li>
            ) : (
              <PortalRow key={portal.portal} portal={portal} />
            ),
          )}
        </ul>
      )}
    </>
  );
}
