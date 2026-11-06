import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
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
import { fileValues, ofRecord, sharedSight } from './rows.js';

const include = {
  sights: { where: sharedSight, select: { hiddenFrom: true } },
} satisfies Prisma.FileVersionInclude;

const toFile = (
  ref: PortalRef,
  row: Prisma.FileVersionGetPayload<{ include: typeof include }>,
) => {
  const { size, mime, contentHash } = fileValues(row);
  return PortalFile.restore({
    id: row.id,
    ref,
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
    removedAt: row.sights[0].hiddenFrom,
  });
};

@Injectable()
export class PrismaPortalFileRepository
  extends PrismaIngestedRepository<PortalFile>
  implements PortalFileRepository
{
  protected readonly lock = LOCK.file;

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.fileVersion.findFirst({
      where: { file: ofRecord(ref), sights: { some: sharedSight } },
      include,
    });
    return row && toFile(ref, row);
  }

  protected async upsert({
    id,
    ref,
    props,
    placement,
    content,
    stale,
    removedAt,
  }: Readonly<FileState>) {
    const { tx } = this.txHost;
    await tx.file.createMany({
      data: { id, ...ofRecord(ref) },
      skipDuplicates: true,
    });
    const data = {
      ...props,
      ...placement,
      contentHash: content,
      contentStale: stale,
    };
    await tx.fileVersion.upsert({
      where: { id },
      create: { id, fileId: id, ...data },
      update: data,
    });
    await tx.fileSight.upsert(this.sight(id, removedAt));
  }
}
