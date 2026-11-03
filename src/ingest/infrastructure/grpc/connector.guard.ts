import {
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { ConnectorTokens } from './connector-tokens.js';

interface ConnectorCall {
  metadata: Metadata;
  portal?: string;
}

// a gRPC handler gets (data, metadata, call), or (call, callback) when it
// takes a client stream; either way the call carries the metadata
const callOf = (ctx: ExecutionContext) => {
  const [first, , third] = ctx.getArgs<unknown[]>();
  return (third ?? first) as ConnectorCall;
};

// A connector's token decides its portal. The guard checks it and puts the
// portal on the call, the way an HTTP guard puts the user on the request.
@Injectable()
export class ConnectorGuard implements CanActivate {
  constructor(private readonly tokens: ConnectorTokens) {}

  canActivate(ctx: ExecutionContext) {
    const call = callOf(ctx);
    call.portal = this.tokens.portalOf(call.metadata);
    return true;
  }
}

// the portal ConnectorGuard found for this call
export const ConnectorPortal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const { portal } = callOf(ctx);
    if (!portal) throw new Error('ConnectorGuard must run first');
    return portal;
  },
);
