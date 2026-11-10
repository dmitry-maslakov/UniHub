import {
  Catch,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { NotYourCourseError } from '../../application/errors.js';

// A pick to go with a course that isn't the user's came well formed, so it's no 400 like the other invalid input (the
// global DomainErrorFilter's): 422, with its reason as the code a client
// tells it by. The route's own filter, ahead of the global one.
@Catch(NotYourCourseError)
export class PickRefusedFilter extends BaseExceptionFilter {
  catch(error: NotYourCourseError, host: ArgumentsHost) {
    super.catch(
      new UnprocessableEntityException({
        statusCode: 422,
        code: error.reason,
        message: error.message,
      }),
      host,
    );
  }
}
