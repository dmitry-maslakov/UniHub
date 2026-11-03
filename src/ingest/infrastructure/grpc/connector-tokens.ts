import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { status, type Metadata } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { parseConnectorTokens, type Env } from '../../../config.js';

// A connector's token decides its portal, it can't write as another one.
// Proper credentials come with auth.
@Injectable()
export class ConnectorTokens {
  private readonly portals: Map<string, string>;

  constructor(config: ConfigService<Env, true>) {
    this.portals = new Map(
      parseConnectorTokens(config.get('CONNECTOR_TOKENS', { infer: true })).map(
        ([portal, token]) => [token, portal],
      ),
    );
  }

  portalOf(metadata: Metadata) {
    const header = String(metadata.get('authorization')[0] ?? '');
    const token = header.replace(/^Bearer\s+/i, '');
    const portal = token && this.portals.get(token);
    if (!portal)
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'unknown connector token',
      });
    return portal;
  }
}
