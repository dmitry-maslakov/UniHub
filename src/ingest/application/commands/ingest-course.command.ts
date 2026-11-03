import { Command } from '@nestjs/cqrs';
import type { CourseRecord } from '@app/plugin-sdk';

export class IngestCourseCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly portal: string,
    public readonly record: CourseRecord,
  ) {
    super();
  }
}
