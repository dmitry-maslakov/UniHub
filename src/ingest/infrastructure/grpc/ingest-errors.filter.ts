import { Catch, type ArgumentsHost } from '@nestjs/common';
import {
  BaseRpcExceptionFilter,
  GrpcAbortedException,
  GrpcCancelledException,
  GrpcException,
  GrpcFailedPreconditionException,
  GrpcInternalException,
  GrpcInvalidArgumentException,
  GrpcUnavailableException,
  RpcException,
} from '@nestjs/microservices';
import { throwError } from 'rxjs';
import { InvalidRecordError, UnknownReferenceError } from '@app/plugin-sdk';
import { isConnectionError } from '../../../is-connection-error.js';

// errors become statuses a connector can act on: fix the record, send the
// parent first, retry later, or report a bug
@Catch()
export class IngestErrorsFilter extends BaseRpcExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    if (error instanceof RpcException) return super.catch(error, host);
    const grpc = this.toGrpc(error);
    return throwError(() => grpc.getError());
  }

  private toGrpc(error: unknown): GrpcException {
    if (error instanceof GrpcException) return error;
    if (error instanceof InvalidRecordError)
      return new GrpcInvalidArgumentException(error.message);
    if (error instanceof UnknownReferenceError)
      return new GrpcFailedPreconditionException(error.message);
    const { code } = error as { code?: unknown };
    // the connector went away mid-stream; nothing was stored, nothing to log
    if (code === 'ERR_STREAM_PREMATURE_CLOSE')
      return new GrpcCancelledException('cancelled');
    // prisma: a write conflict or deadlock, worth retrying
    if (code === 'P2034') return new GrpcAbortedException('try again');
    BaseRpcExceptionFilter.logger.error(error);
    return isConnectionError(error)
      ? new GrpcUnavailableException('try again later')
      : new GrpcInternalException('internal error');
  }
}
