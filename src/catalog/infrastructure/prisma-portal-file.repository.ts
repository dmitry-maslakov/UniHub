import { Injectable } from '@nestjs/common';
import type { ContentHash, MediaType, PortalId } from '@app/kernel';
import type { File as Row } from '../../generated/prisma/client.js';
import {
  PortalFile,
  type FileState,
} from '../domain/portal-file/portal-file.js';
import type { PortalFileRepository } from '../domain/portal-file/portal-file.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import { byPortalRef } from './by-portal-ref.js';
import {
  LOCK,
  PrismaIngestedRepository,
} from './prisma-ingested.repository.js';

// Values were checked on the way in (media types of older rows by their
// migration too). Size is a bigint in the db (files over 2 GB), a number
// everywhere else.
const toFile = (row: Row) =>
  PortalFile.restore({
    id: row.id,
    ref: { portal: row.portal as PortalId, externalId: row.externalId },
    props: {
      name: row.name,
      path: row.path,
      url: row.url,
      size: row.size === null ? null : Number(row.size),
      mime: row.mime as MediaType | null,
      sourceUpdatedAt: row.sourceUpdatedAt,
    },
    placement: { portalCourseId: row.portalCourseId, itemId: row.itemId },
    content: row.contentHash as ContentHash | null,
    stale: row.contentStale,
    removedAt: row.removedAt,
  });

@Injectable()
export class PrismaPortalFileRepository
  extends PrismaIngestedRepository<PortalFile>
  implements PortalFileRepository
{
  protected readonly lock = LOCK.file;

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.file.findUnique({
      where: byPortalRef(ref),
    });
    return row && toFile(row);
  }

  protected upsert({
    id,
    ref,
    props,
    placement,
    content,
    stale,
    removedAt,
  }: Readonly<FileState>) {
    const data = {
      portal: ref.portal,
      externalId: ref.externalId,
      ...props,
      ...placement,
      contentHash: content,
      contentStale: stale,
      removedAt,
    };
    return this.txHost.tx.file.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
}
