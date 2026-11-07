import {
  Catch,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import {
  TokenRefusedError,
  TokensNotAllowedError,
} from '../../application/errors.js';

// A token the portal didn't take, or one the portal's site takes none of,
// came well formed, so it's no 400 like the other invalid input (the
// global DomainErrorFilter's): 422, saying only that, with its reason as
// `code` to tell the two apart (TOKEN_REFUSED, TOKENS_NOT_ALLOWED). The
// route's own filter, ahead of the global one.
@Catch(TokenRefusedError, TokensNotAllowedError)
export class TokenRefusedFilter extends BaseExceptionFilter {
  catch(error: TokenRefusedError | TokensNotAllowedError, host: ArgumentsHost) {
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
