import { Command } from '@nestjs/cqrs';

export class CreateCourseCommand extends Command<{ id: string }> {
  constructor(
    public readonly slug: string,
    public readonly name: string,
  ) {
    super();
  }
}
