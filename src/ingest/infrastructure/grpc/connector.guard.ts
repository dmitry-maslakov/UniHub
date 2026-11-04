import {
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { Connection } from '../../domain/connection.js';
import { ConnectorTokens } from './connector-tokens.js';

// a gRPC handler gets (data, metadata, call), or (call, callback) when it
// takes a client stream; either way the call carries the metadata
const callOf = (ctx: ExecutionContext) => {
  const [first, , third] = ctx.getArgs<unknown[]>();
  return (third ?? first) as { metadata: Metadata };
};

// the connection of each call, kept beside the call rather than on it
const connections = new WeakMap<object, Connection>();

// A connector's token decides its portal; external connectors sync what
// everyone sees, the portal's shared account. The guard checks the token
// and remembers the connection for the call, the way an HTTP guard puts
// the user on the request.
@Injectable()
export class ConnectorGuard implements CanActivate {
  constructor(private readonly tokens: ConnectorTokens) {}

  canActivate(ctx: ExecutionContext) {
    const call = callOf(ctx);
    const portal = this.tokens.portalOf(call.metadata);
    connections.set(call, Connection.shared(portal));
    return true;
  }
}

// the connection ConnectorGuard found for this call
export const ConnectorConnection = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const connection = connections.get(callOf(ctx));
    if (!connection) throw new Error('ConnectorGuard must run first');
    return connection;
  },
);
