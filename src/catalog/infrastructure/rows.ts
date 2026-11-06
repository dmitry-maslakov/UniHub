import {
  SHARED_ACCOUNT,
  type ContentHash,
  type Json,
  type MediaType,
  type PortalId,
} from '@app/kernel';
import type {
  CourseVersion,
  FileVersion,
  ItemVersion,
} from '../../generated/prisma/client.js';
import type { PortalRef } from '../domain/portal-ref.js';
import type { Stamp } from '../domain/view/view.repository.js';

// What the repositories and the read side both know of catalog's rows: a
// record's ids (PortalCourse, Item, File), its versions, and the accounts'
// sights of them (catalog.prisma).

// the record a version is of, in a relation filter, from the two fields
// alone: Prisma refuses any other a caller's object may carry
export const ofRecord = ({ portal, externalId }: PortalRef) => ({
  portal,
  externalId,
});

// a version's record, as the read side selects it
export const recordRef = { select: { portal: true, externalId: true } };

// What every reader reads for now: the shared account's view, its sights
// of versions that aren't hidden from it
export const sharedSight = { account: SHARED_ACCOUNT };
export const seenByShared = { some: { ...sharedSight, hiddenFrom: null } };

// A version some account sees now: one none sees is removed. A pass hides
// what a user's account no longer sees from a slot to come, so it's seen
// till then.
const unhidden = (now: Date) => ({
  OR: [{ hiddenFrom: null }, { hiddenFrom: { gt: now } }],
});
export const seen = (now = new Date()) => ({ some: unhidden(now) });
export const liveSights = (now = new Date()) => ({
  where: unhidden(now),
  select: { account: true },
  take: 1,
});

// A row's columns as the kernel's values. They were checked on the way in
// (media types of older rows by their migration too), so reading them back
// needs no second check.

// every record has one; the course listing reads it without the rest
export const portalOf = (row: { portal: string }) => row.portal as PortalId;

// the content listing reads it without the rest
export const contentOf = (row: Pick<FileVersion, 'contentHash'>) =>
  row.contentHash as ContentHash | null;

// size is a bigint in the db (files over 2 GB), a number everywhere else
export const fileValues = (
  row: Pick<FileVersion, 'size' | 'mime' | 'contentHash'>,
) => ({
  size: row.size === null ? null : Number(row.size),
  mime: row.mime as MediaType | null,
  contentHash: contentOf(row),
});

export const itemValues = (row: Pick<ItemVersion, 'raw'>) => ({
  raw: row.raw as Json,
});

export const courseValues = (row: Pick<CourseVersion, 'meta'>) => ({
  meta: row.meta as Json | null,
});

// a file's version of its bytes, as its columns hold it
export const stampOf = ({ size, sourceUpdatedAt }: Stamp) => ({
  size: size === null ? null : BigInt(size),
  sourceUpdatedAt,
});
