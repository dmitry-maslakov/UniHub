import { Loader, Text } from '@mantine/core';
import { api } from '@/shared/api';
import { PageTitle } from '@/shared/ui';
import { PortalCatalog } from './portal-catalog';
import { SourceRow } from './source-row';
import classes from './sources.module.css';

export function SourcesPage() {
  const portals = api.useQuery('get', '/api/me/portals');
  return (
    <>
      <PageTitle description="Where the hub reads your courses from. Link your own account, and the hub reads the courses you follow there, as you see them; on a public site, pick the courses you follow.">
        Sources
      </PageTitle>
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
                <PortalCatalog portal={portal} />
              </li>
            ) : (
              <SourceRow key={portal.portal} portal={portal} />
            ),
          )}
        </ul>
      )}
    </>
  );
}
