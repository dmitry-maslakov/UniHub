import { Query } from '@nestjs/cqrs';
import type { PortalCourseDto } from './dtos.js';

export class GetPortalCourseQuery extends Query<PortalCourseDto | null> {
  constructor(public readonly id: string) {
    super();
  }
}
