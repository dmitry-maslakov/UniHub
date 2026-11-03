import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  CourseRepository,
  type Course,
  type CourseLink,
} from '../domain/course.js';

const toCourse = ({ id, slug, name }: Course): Course => ({ id, slug, name });

@Injectable()
export class PrismaCourseRepository extends CourseRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  private get db() {
    return this.txHost.tx;
  }

  async create(slug: string, name: string) {
    try {
      return toCourse(await this.db.course.create({ data: { slug, name } }));
    } catch (err) {
      // unique violation on slug
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )
        return null;
      throw err;
    }
  }

  async findBySlug(slug: string) {
    const row = await this.db.course.findUnique({ where: { slug } });
    return row && toCourse(row);
  }

  async list() {
    const rows = await this.db.course.findMany({ orderBy: { slug: 'asc' } });
    return rows.map(toCourse);
  }

  async link({ courseId, portalCourseId, year }: CourseLink) {
    await this.db.courseLink.upsert({
      where: { portalCourseId },
      create: { courseId, portalCourseId, year },
      update: { courseId, year },
    });
  }

  async unlink(portalCourseId: string) {
    const { count } = await this.db.courseLink.deleteMany({
      where: { portalCourseId },
    });
    return count > 0;
  }

  async courseIdOf(portalCourseId: string) {
    const row = await this.db.courseLink.findUnique({
      where: { portalCourseId },
      select: { courseId: true },
    });
    return row?.courseId ?? null;
  }

  async linksOf(courseIds: string[]) {
    const rows = await this.db.courseLink.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: [{ year: 'asc' }, { portalCourseId: 'asc' }],
    });
    return rows.map(({ courseId, portalCourseId, year }) => ({
      courseId,
      portalCourseId,
      year,
    }));
  }
}
