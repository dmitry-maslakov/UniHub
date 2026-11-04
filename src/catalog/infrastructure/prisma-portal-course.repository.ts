import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type PortalCourse as Row,
} from '../../generated/prisma/client.js';
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
import { byPortalRef, portalCourseValues } from './rows.js';

const toPortalCourse = (row: Row) => {
  const { portal, meta } = portalCourseValues(row);
  return PortalCourse.restore({
    id: row.id,
    ref: { portal, externalId: row.externalId },
    props: { name: row.name, url: row.url, meta },
  });
};

@Injectable()
export class PrismaPortalCourseRepository
  extends PrismaIngestedRepository<PortalCourse>
  implements PortalCourseRepository
{
  protected readonly lock = LOCK.course;

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.portalCourse.findUnique({
      where: byPortalRef(ref),
    });
    return row && toPortalCourse(row);
  }

  protected upsert({ id, ref, props }: Readonly<PortalCourseState>) {
    const data = {
      portal: ref.portal,
      externalId: ref.externalId,
      ...props,
      // no meta is no value at all, not a json null
      meta: props.meta === null ? Prisma.DbNull : props.meta,
    };
    return this.txHost.tx.portalCourse.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
}
