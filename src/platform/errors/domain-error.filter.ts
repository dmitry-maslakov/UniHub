import {
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
  type ArgumentsHost,
  type HttpException,
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
};

// One answer per kind of domain error, whichever module threw it: Nest's own
// exception for its status, so the body looks like any other error's. Global,
// for HTTP; MCP (access) and gRPC (ingest) have filters of their own.
@Catch(DomainError)
export class DomainErrorFilter extends BaseExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    super.catch(new HTTP[error.kind](error.message, { cause: error }), host);
  }
}
