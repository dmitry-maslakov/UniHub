import { Command } from '@nestjs/cqrs';

export class UnlinkPortalCourseCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly portal: string,
    public readonly externalId: string,
  ) {
    super();
  }
}
