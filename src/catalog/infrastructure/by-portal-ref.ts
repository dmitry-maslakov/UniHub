import type { PortalRef } from '../domain/portal-ref.js';

// a record's unique key, from the two fields alone: Prisma refuses any other
// a caller's object may carry
export const byPortalRef = ({ portal, externalId }: PortalRef) => ({
  portal_externalId: { portal, externalId },
});
