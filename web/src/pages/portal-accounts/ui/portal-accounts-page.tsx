import { Loader, Text } from '@mantine/core';
import { api } from '@/shared/api';
import { PageTitle } from '@/shared/ui';
import classes from './portal-accounts.module.css';
import { PortalCatalog } from './portal-catalog';
import { PortalRow } from './portal-row';

export function PortalAccountsPage() {
  const portals = api.useQuery('get', '/api/me/portals');
  return (
    <>
      <PageTitle description="Link your own account of a portal, or pick courses of a public one, so the hub can read the courses you follow there. A token stays with the hub and is never shown again.">
        Portal accounts
      </PageTitle>
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
