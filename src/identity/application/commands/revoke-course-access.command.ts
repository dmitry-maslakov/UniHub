import { Command } from '@nestjs/cqrs';

export class RevokeCourseAccessCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly userId: string,
    public readonly courseSlug: string,
  ) {
    super();
  }
}
