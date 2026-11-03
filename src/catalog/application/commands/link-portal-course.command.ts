import { Command } from '@nestjs/cqrs';

// linking a portal course that is already linked moves it to this course
export class LinkPortalCourseCommand extends Command<void> {
  constructor(
    public readonly courseSlug: string,
    public readonly portal: string,
    public readonly externalId: string,
    public readonly year: number | null,
  ) {
    super();
  }
}
