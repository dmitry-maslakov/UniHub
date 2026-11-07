import type { TitleOrder } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { portalsQuery } from '@/entities/source';
import { EmptyState, ListSkeleton, QueryState } from '@/shared/ui';
import { orderSources } from '../lib/order';
import { PortalCatalog } from './portal-catalog';
import { SourceRow } from './source-row';
import classes from './sources.module.css';

// The sources the hub reads courses from, each with what the user does
// there: a token source's account to link, a shared one's word that there's
// nothing to do, a public one's catalog to pick from; short sections first.
// Each is titled at `order`, a level under the heading it sits beneath. Not
// RowList rows: each holds a heading and a form, which a row's text doesn't.
export function SourceCards({ order }: { order: TitleOrder }) {
  const { t } = useTranslation('sources');
  const portals = useQuery(portalsQuery());
  return (
    <QueryState
      query={portals}
      loading={<ListSkeleton rows={2} label={t('loading')} />}
      isEmpty={(data) => !data.length}
      empty={
        <EmptyState title={t('empty.title')}>{t('empty.body')}</EmptyState>
      }
    >
      {(data) => (
        // list-style: none makes WebKit drop the list role
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles
        <ul className={classes.list} role="list" aria-label={t('list.aria')}>
          {orderSources(data).map((portal) =>
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
    </QueryState>
  );
}
