import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PortalCourse,
  type PortalCourseState,
} from '../domain/portal-course/portal-course.js';
import type { PortalCourseRepository } from '../domain/portal-course/portal-course.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import {
  LOCK,
  PrismaIngestedRepository,
} from './prisma-ingested.repository.js';
import { courseValues, ofRecord, sharedSight } from './rows.js';

@Injectable()
export class PrismaPortalCourseRepository
  extends PrismaIngestedRepository<PortalCourse>
  implements PortalCourseRepository
{
  protected readonly lock = LOCK.course;

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.courseVersion.findFirst({
      where: { portalCourse: ofRecord(ref), sights: { some: sharedSight } },
    });
    return (
      row &&
      PortalCourse.restore({
        id: row.id,
        ref,
        props: { name: row.name, url: row.url, ...courseValues(row) },
      })
    );
  }

  async recordId(ref: PortalRef) {
    const row = await this.txHost.tx.portalCourse.findUnique({
      where: { portal_externalId: ofRecord(ref) },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  @Transactional(Propagation.Mandatory)
  async keep(ref: PortalRef) {
    await this.lockFor(ref);
    await this.txHost.tx.portalCourse.createMany({
      data: { id: randomUUID(), ...ofRecord(ref) },
      skipDuplicates: true,
    });
    return (await this.recordId(ref))!;
  }

  protected async upsert({ id, ref, props }: Readonly<PortalCourseState>) {
    const { tx } = this.txHost;
    await tx.portalCourse.createMany({
      data: { id, ...ofRecord(ref) },
      skipDuplicates: true,
    });
    const data = {
      ...props,
      // no meta is no value at all, not a json null
      meta: props.meta === null ? Prisma.DbNull : props.meta,
    };
    await tx.courseVersion.upsert({
      where: { id },
      create: { id, portalCourseId: id, ...data },
      update: data,
    });
    await tx.courseSight.upsert(this.sight(id));
  }
}
