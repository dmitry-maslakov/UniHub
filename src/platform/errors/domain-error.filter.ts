import {
  BadRequestException,
  Catch,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
  type HttpExceptionOptions,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { DomainError, type DomainErrorKind } from '@app/kernel';

const HTTP: Record<
  DomainErrorKind,
  new (message: string, options: HttpExceptionOptions) => HttpException
> = {
  'not-found': NotFoundException,
  conflict: ConflictException,
  invalid: BadRequestException,
  unavailable: ServiceUnavailableException,
};

// One answer per kind of domain error, whichever module threw it: Nest's own
// exception for its status, so the body looks like any other error's, with
// the error's reason as `code` for a client's code to tell apart where the
// status doesn't (PORTAL_UNREACHABLE). Global, for HTTP; MCP (access) and
// gRPC (ingest) have filters of their own.
@Catch(DomainError)
export class DomainErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(error: DomainError, host: ArgumentsHost) {
    // the hub failing, not the caller: Nest logs no HttpException, so an
    // outage would leave no trace otherwise
    if (error.kind === 'unavailable') this.logger.error(error);
    const answer = new HTTP[error.kind](error.message, { cause: error });
    super.catch(
      new HttpException(
        { ...(answer.getResponse() as object), code: error.reason },
        answer.getStatus(),
        { cause: error },
      ),
      host,
    );
  }
}
