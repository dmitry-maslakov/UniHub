import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../storage/contracts.js';
import { IngestService } from './application/ingest.service.js';
import { FetchLeases } from './domain/fetch-leases.js';
import { SyncStateRepository } from './domain/sync-state.js';
import { ConnectorTokens } from './infrastructure/grpc/connector-tokens.js';
import { IngestGrpcController } from './infrastructure/grpc/ingest.grpc.controller.js';
import { PrismaSyncStateRepository } from './infrastructure/prisma-sync-state.repository.js';
import { RedisFetchLeases } from './infrastructure/redis-fetch-leases.js';
import { ingestConfig } from './ingest.config.js';

// the single way in for data from plugins, whatever transport they use
@Module({
  imports: [ConfigModule.forFeature(ingestConfig), StorageModule],
  controllers: [IngestGrpcController],
  providers: [
    IngestService,
    ConnectorTokens,
    { provide: SyncStateRepository, useClass: PrismaSyncStateRepository },
    { provide: FetchLeases, useClass: RedisFetchLeases },
  ],
  exports: [IngestService, ConnectorTokens],
})
export class IngestModule {}
