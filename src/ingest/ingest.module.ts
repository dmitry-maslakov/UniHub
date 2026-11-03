import { Module } from '@nestjs/common';
import { HubIngest } from './application/hub-ingest.js';
import { SyncStateRepository } from './domain/sync-state.js';
import { ConnectorTokens } from './infrastructure/grpc/connector-tokens.js';
import { IngestGrpcController } from './infrastructure/grpc/ingest.grpc.controller.js';
import { PrismaSyncStateRepository } from './infrastructure/prisma-sync-state.repository.js';

// the single way in for data from plugins, whatever transport they use
@Module({
  controllers: [IngestGrpcController],
  providers: [
    HubIngest,
    ConnectorTokens,
    { provide: SyncStateRepository, useClass: PrismaSyncStateRepository },
  ],
  exports: [HubIngest],
})
export class IngestModule {}
