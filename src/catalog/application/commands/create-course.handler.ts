import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidValueError } from '@app/kernel';
import { CourseRepository } from '../../domain/course.js';
import { CourseSlugTakenError } from '../../domain/errors.js';
import { CreateCourseCommand } from './create-course.command.js';

// slugs are what people type and folder names: lower case, digits, dashes
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@CommandHandler(CreateCourseCommand)
export class CreateCourseHandler implements ICommandHandler<CreateCourseCommand> {
  constructor(private readonly courses: CourseRepository) {}

  async execute({ slug, name }: CreateCourseCommand) {
    if (!SLUG.test(slug)) throw new InvalidValueError('course slug', slug);
    if (!name.trim()) throw new InvalidValueError('course name', name);
    const course = await this.courses.create(slug, name.trim());
    if (!course) throw new CourseSlugTakenError(slug);
    return { id: course.id };
  }
}
