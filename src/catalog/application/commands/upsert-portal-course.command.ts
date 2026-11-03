import { Command } from '@nestjs/cqrs';
import type { PortalCourseData } from '../../domain/portal-course.js';

export class UpsertPortalCourseCommand extends Command<{
  id: string;
  changed: boolean;
}> {
  constructor(public readonly data: PortalCourseData) {
    super();
  }
}
