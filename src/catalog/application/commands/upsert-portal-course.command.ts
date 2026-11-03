import { Command } from '@nestjs/cqrs';
import type { Upserted } from '../../domain/changes.js';
import type {
  PortalCourse,
  PortalCourseData,
} from '../../domain/portal-course.js';

export class UpsertPortalCourseCommand extends Command<Upserted<PortalCourse>> {
  constructor(public readonly data: PortalCourseData) {
    super();
  }
}
