import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Metadata } from '@grpc/grpc-js';
import { GrpcUnauthenticatedException } from '@nestjs/microservices';
import type { PortalId } from '@app/kernel';
import { ingestConfig } from '../../ingest.config.js';

// A connector's token decides its portal, it can't write as another one.
// Several tokens for one portal let a token be rotated. Proper credentials
// come with auth.
@Injectable()
export class ConnectorTokens {
  private readonly byToken: ReadonlyMap<string, PortalId>;

  constructor(
    @Inject(ingestConfig.KEY) { tokens }: ConfigType<typeof ingestConfig>,
  ) {
    this.byToken = tokens;
  }

  // portals whose connectors run outside the hub
  portals() {
    return [...new Set(this.byToken.values())];
  }

  portalOf(metadata: Metadata) {
    const header = String(metadata.get('authorization')[0] ?? '');
    const token = header.replace(/^Bearer\s+/i, '');
    const portal = token && this.byToken.get(token);
    if (!portal)
      throw new GrpcUnauthenticatedException('unknown connector token');
    return portal;
  }
}
