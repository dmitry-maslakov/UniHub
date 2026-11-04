import { Injectable } from '@nestjs/common';
import type { File as Row } from '../../generated/prisma/client.js';
import {
  PortalFile,
  type FileState,
} from '../domain/portal-file/portal-file.js';
import type { PortalFileRepository } from '../domain/portal-file/portal-file.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import {
  LOCK,
  PrismaIngestedRepository,
} from './prisma-ingested.repository.js';
import { byPortalRef, fileValues } from './rows.js';

const toFile = (row: Row) => {
  const { portal, size, mime, contentHash } = fileValues(row);
  return PortalFile.restore({
    id: row.id,
    ref: { portal, externalId: row.externalId },
    props: {
      name: row.name,
      path: row.path,
      url: row.url,
      size,
      mime,
      sourceUpdatedAt: row.sourceUpdatedAt,
    },
    placement: { portalCourseId: row.portalCourseId, itemId: row.itemId },
    content: contentHash,
    stale: row.contentStale,
    removedAt: row.removedAt,
  });
};

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
