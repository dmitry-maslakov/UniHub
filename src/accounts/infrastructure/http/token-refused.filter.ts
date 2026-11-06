import {
  Catch,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { TokenRefusedError } from '../../application/errors.js';

// A token the portal didn't take came well formed, so it's no 400 like the
// other invalid input (the global DomainErrorFilter's): 422, saying only
// that. The route's own filter, ahead of the global one.
@Catch(TokenRefusedError)
export class TokenRefusedFilter extends BaseExceptionFilter {
  catch(error: TokenRefusedError, host: ArgumentsHost) {
    super.catch(new UnprocessableEntityException(error.message), host);
  }
}
