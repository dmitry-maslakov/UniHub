import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import type { PortalRef } from '../domain/portal-ref.js';

export const LOCK = { course: 1, item: 2, file: 3 } as const;

// Two writes of the same record at once would both read "not there" and
// collide on insert, or both read the old state and one write over the
// other. An advisory lock on the portal's id serialises them until the
// transaction ends, records that don't exist yet included (which a row lock
// or a version column can't cover). Taken in getForUpdate, which only runs
// in a transaction: without one, the lock would end with the statement.
export async function lockRecord(
  tx: PrismaTxHost['tx'],
  kind: (typeof LOCK)[keyof typeof LOCK],
  { portal, externalId }: PortalRef,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${kind}::int, hashtext(${`${portal}:${externalId}`}))`;
}
