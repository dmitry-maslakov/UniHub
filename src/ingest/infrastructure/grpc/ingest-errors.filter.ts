import { Catch, type ArgumentsHost } from '@nestjs/common';
import {
  BaseRpcExceptionFilter,
  GrpcAbortedException,
  GrpcCancelledException,
  GrpcException,
  GrpcFailedPreconditionException,
  GrpcAlreadyExistsException,
  GrpcInternalException,
  GrpcInvalidArgumentException,
  GrpcNotFoundException,
  GrpcUnavailableException,
  RpcException,
} from '@nestjs/microservices';
import { throwError } from 'rxjs';
import { DomainError, type DomainErrorKind } from '@app/kernel';
import { InvalidRecordError, UnknownReferenceError } from '@app/plugin-sdk';
import { isWriteConflict } from '../../../platform/database/write-conflict.js';
import { isConnectionError } from '../../../platform/errors/is-connection-error.js';

// the hub's own kinds of error, the way HTTP answers them too
const KINDS: Record<DomainErrorKind, new (message: string) => GrpcException> = {
  'not-found': GrpcNotFoundException,
  conflict: GrpcAlreadyExistsException,
  invalid: GrpcInvalidArgumentException,
};

// errors become statuses a connector can act on: fix the record, send the
// parent first, retry later, or report a bug
@Catch()
export class IngestErrorsFilter extends BaseRpcExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    if (error instanceof RpcException) return super.catch(error, host);
    // the connector went away mid-call; nothing was stored, nothing to log
    const call = host.getArgByIndex<{ cancelled?: boolean } | undefined>(0);
    const grpc = call?.cancelled
      ? new GrpcCancelledException('cancelled')
      : this.toGrpc(error);
    return throwError(() => grpc.getError());
  }

  private toGrpc(error: unknown): GrpcException {
    if (error instanceof GrpcException) return error;
    if (error instanceof InvalidRecordError)
      return new GrpcInvalidArgumentException(error.message);
    if (error instanceof UnknownReferenceError)
      return new GrpcFailedPreconditionException(error.message);
    if (error instanceof DomainError)
      return new KINDS[error.kind](error.message);
    if (isWriteConflict(error)) return new GrpcAbortedException('try again');
    BaseRpcExceptionFilter.logger.error(error);
    return isConnectionError(error)
      ? new GrpcUnavailableException('try again later')
      : new GrpcInternalException('internal error');
  }
}
