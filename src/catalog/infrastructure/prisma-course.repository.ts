import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { Course } from '../domain/course/course.js';
import { CourseRepository } from '../domain/course/course.repository.js';
import type { CourseName, Slug } from '../domain/values.js';

@Injectable()
export class PrismaCourseRepository extends CourseRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async add({ id, slug, name }: Course) {
    try {
      await this.txHost.tx.course.create({ data: { id, slug, name } });
      return true;
    } catch (err) {
      // unique violation: the slug is taken
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )
        return false;
      throw err;
    }
  }

  async findBySlug(slug: Slug) {
    const row = await this.txHost.tx.course.findUnique({ where: { slug } });
    // checked when the course was made
    return (
      row &&
      Course.restore({
        id: row.id,
        slug: row.slug as Slug,
        name: row.name as CourseName,
      })
    );
  }
}
