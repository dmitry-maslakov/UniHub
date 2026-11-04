import type { ContentHash, Json, MediaType, PortalId } from '@app/kernel';
import type {
  File,
  Item,
  PortalCourse,
} from '../../generated/prisma/client.js';
import type { PortalRef } from '../domain/portal-ref.js';

// What the repositories and the read side both know of catalog's rows.

// a record's unique key, from the two fields alone: Prisma refuses any other
// a caller's object may carry
export const byPortalRef = ({ portal, externalId }: PortalRef) => ({
  portal_externalId: { portal, externalId },
});

// A row's columns as the kernel's values. They were checked on the way in
// (media types of older rows by their migration too), so reading them back
// needs no second check.

// every ingested row has one; the course listing reads it without the rest
export const portalOf = (row: { portal: string }) => row.portal as PortalId;

// the content listing reads it without the rest
export const contentOf = (row: Pick<File, 'contentHash'>) =>
  row.contentHash as ContentHash | null;

// size is a bigint in the db (files over 2 GB), a number everywhere else
export const fileValues = (
  row: Pick<File, 'portal' | 'size' | 'mime' | 'contentHash'>,
) => ({
  portal: portalOf(row),
  size: row.size === null ? null : Number(row.size),
  mime: row.mime as MediaType | null,
  contentHash: contentOf(row),
});

export const itemValues = (row: Pick<Item, 'portal' | 'raw'>) => ({
  portal: portalOf(row),
  raw: row.raw as Json,
});

export const portalCourseValues = (
  row: Pick<PortalCourse, 'portal' | 'meta'>,
) => ({
  portal: portalOf(row),
  meta: row.meta as Json | null,
});
