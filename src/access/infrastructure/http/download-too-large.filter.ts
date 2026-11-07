import {
  Catch,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { DownloadTooLargeError } from '../../application/errors.js';

// A request that came well formed but asks for more than the hub zips is
// no 400 like the other invalid input (the global DomainErrorFilter's): 422,
// with its reason as the code a client tells it by. The route's own filter,
// ahead of the global one.
@Catch(DownloadTooLargeError)
export class DownloadTooLargeFilter extends BaseExceptionFilter {
  catch(error: DownloadTooLargeError, host: ArgumentsHost) {
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
