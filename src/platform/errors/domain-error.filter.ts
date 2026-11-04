import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { DomainError, type DomainErrorKind } from '@app/kernel';

const STATUS: Record<DomainErrorKind, HttpStatus> = {
  'not-found': HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  invalid: HttpStatus.BAD_REQUEST,
};

// One answer per kind of domain error, whichever module threw it: a status
// over HTTP, an error the model can read over MCP. Global for HTTP; MCP's
// tools name it themselves (global filters don't reach microservices), and
// gRPC has ingest's own.
@Catch(DomainError)
export class DomainErrorFilter extends BaseExceptionFilter {
  private readonly rpc = new BaseRpcExceptionFilter();

  catch(error: DomainError, host: ArgumentsHost) {
    if (host.getType() === 'rpc')
      return this.rpc.catch(new RpcException(error.message), host);
    return super.catch(
      new HttpException(error.message, STATUS[error.kind]),
      host,
    );
  }
}
