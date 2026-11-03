import { Command } from '@nestjs/cqrs';

export class GrantCourseAccessCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly userId: string,
    public readonly courseSlug: string,
  ) {
    super();
  }
}
