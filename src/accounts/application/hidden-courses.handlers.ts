import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { HideCoursesCommand, ShowCoursesCommand } from './commands.js';
import { HiddenCourses } from './hidden-courses.js';

@CommandHandler(HideCoursesCommand)
export class HideCoursesHandler implements ICommandHandler<HideCoursesCommand> {
  constructor(private readonly hidden: HiddenCourses) {}

  execute({ userId, portalCourseIds }: HideCoursesCommand) {
    return this.hidden.hide(userId, portalCourseIds);
  }
}

@CommandHandler(ShowCoursesCommand)
export class ShowCoursesHandler implements ICommandHandler<ShowCoursesCommand> {
  constructor(private readonly hidden: HiddenCourses) {}

  execute({ userId, portalCourseIds, pick }: ShowCoursesCommand) {
    return this.hidden.show(userId, portalCourseIds, pick);
  }
}
