import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SetCourseStateCommand } from './commands.js';
import { CourseSwitches } from './course-switches.js';

@CommandHandler(SetCourseStateCommand)
export class SetCourseStateHandler implements ICommandHandler<SetCourseStateCommand> {
  constructor(private readonly switches: CourseSwitches) {}

  execute({ userId, portalCourseIds, state }: SetCourseStateCommand) {
    return this.switches.set(userId, portalCourseIds, state);
  }
}
