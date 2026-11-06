import {
  Catch,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import {
  OAuthRefusedError,
  TokenRefusedError,
} from '../../application/errors.js';

// A token the portal didn't take, or a consent it didn't give, came well
// formed, so it's no 400 like the other invalid input (the global
// DomainErrorFilter's): 422, saying only that. The route's own filter,
// ahead of the global one.
@Catch(TokenRefusedError, OAuthRefusedError)
export class TokenRefusedFilter extends BaseExceptionFilter {
  catch(error: TokenRefusedError | OAuthRefusedError, host: ArgumentsHost) {
    super.catch(new UnprocessableEntityException(error.message), host);
  }
}
