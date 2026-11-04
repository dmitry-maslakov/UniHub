import type { ContentHash, MediaType, PortalId } from '@app/kernel';
import type { File } from '../../generated/prisma/client.js';
import type { PortalRef } from '../domain/portal-ref.js';

// What the repositories and the read side both know of catalog's rows.

// a record's unique key, from the two fields alone: Prisma refuses any other
// a caller's object may carry
export const byPortalRef = ({ portal, externalId }: PortalRef) => ({
  portal_externalId: { portal, externalId },
});

// Values were checked on the way in (media types of older rows by their
// migration too). Size is a bigint in the db (files over 2 GB), a number
// everywhere else.
export const fileValues = (
  row: Pick<File, 'portal' | 'size' | 'mime' | 'contentHash'>,
) => ({
  portal: row.portal as PortalId,
  size: row.size === null ? null : Number(row.size),
  mime: row.mime as MediaType | null,
  contentHash: row.contentHash as ContentHash | null,
});
