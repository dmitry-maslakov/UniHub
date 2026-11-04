import { Catch, type ArgumentsHost } from '@nestjs/common';
import {
  BaseRpcExceptionFilter,
  GrpcAbortedException,
  GrpcCancelledException,
  GrpcException,
  GrpcInternalException,
  GrpcStatus,
  GrpcUnavailableException,
  RpcException,
} from '@nestjs/microservices';
import { throwError } from 'rxjs';
import { DomainError, type DomainErrorKind } from '@app/kernel';
import { UnknownReferenceError } from '../../../catalog/contracts.js';
import { isWriteConflict } from '../../../platform/database/write-conflict.js';
import { isConnectionError } from '../../../platform/errors/is-connection-error.js';
import { statusDetails } from './status-details.js';

// the hub's own kinds of error, the way HTTP answers them too
const KINDS: Record<DomainErrorKind, GrpcStatus> = {
  'not-found': GrpcStatus.NOT_FOUND,
  conflict: GrpcStatus.ALREADY_EXISTS,
  invalid: GrpcStatus.INVALID_ARGUMENT,
};

// a record that refers to one the connector hasn't sent: send that first
const codeOf = (error: DomainError) =>
  error instanceof UnknownReferenceError
    ? GrpcStatus.FAILED_PRECONDITION
    : KINDS[error.kind];

const withReason = (error: DomainError) => {
  const code = codeOf(error);
  const { message, reason } = error;
  return { code, message, metadata: statusDetails(code, message, reason) };
};

// Errors become statuses a connector can act on: fix the record, send the
// parent first, retry later, or report a bug. Domain errors also say which
// one it is, in the standard status details.
@Catch()
export class IngestErrorsFilter extends BaseRpcExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    if (error instanceof RpcException) return super.catch(error, host);
    // the connector went away mid-call; nothing was stored, nothing to log
    const call = host.getArgByIndex<{ cancelled?: boolean } | undefined>(0);
    const grpc = call?.cancelled
      ? new GrpcCancelledException('cancelled').getError()
      : this.toGrpc(error);
    return throwError(() => grpc);
  }

  private toGrpc(error: unknown) {
    if (error instanceof GrpcException) return error.getError();
    if (error instanceof DomainError) return withReason(error);
    if (isWriteConflict(error))
      return new GrpcAbortedException('try again').getError();
    BaseRpcExceptionFilter.logger.error(error);
    const grpc = isConnectionError(error)
      ? new GrpcUnavailableException('try again later')
      : new GrpcInternalException('internal error');
    return grpc.getError();
  }
}
