import { Loader, Text, type TitleOrder } from '@mantine/core';
import { api } from '@/shared/api';
import { PortalCatalog } from './portal-catalog';
import { SourceRow } from './source-row';
import classes from './sources.module.css';

// The sources the hub reads courses from, each with what the user does
// there: a token source's account to link, a public one's catalog to pick
// from, a shared one's word that there's nothing to do. Each is titled at
// `order`, a level under the heading it sits beneath.
export function SourceCards({ order }: { order: TitleOrder }) {
  const portals = api.useQuery('get', '/api/me/portals');
  return (
    <>
      {portals.isPending && (
        <Loader size="sm" aria-label="Loading your sources" />
      )}
      {portals.isError && (
        <Text c="red" role="alert">
          Couldn't load your sources. Reload the page to try again.
        </Text>
      )}
      {portals.data && !portals.data.length && (
        <Text c="dimmed">No sources are set up on this hub yet.</Text>
      )}
      {portals.data && portals.data.length > 0 && (
        <ul className={classes.list} aria-label="Sources">
          {portals.data.map((portal) =>
            portal.mode === 'public' ? (
              <li key={portal.portal} className={classes.row}>
                <PortalCatalog portal={portal} order={order} />
              </li>
            ) : (
              <SourceRow key={portal.portal} portal={portal} order={order} />
            ),
          )}
        </ul>
      )}
    </>
  );
}
