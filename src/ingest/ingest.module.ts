import { Global, Module } from '@nestjs/common';
import { Ingest } from '@app/plugin-sdk';
import { HubIngest } from './application/hub-ingest.js';
import { SyncStateRepository } from './domain/sync-state.js';
import { PrismaSyncStateRepository } from './infrastructure/prisma-sync-state.repository.js';

// the single way in for data from plugins, whatever transport they use
@Global()
@Module({
  providers: [
    { provide: Ingest, useClass: HubIngest },
    { provide: SyncStateRepository, useClass: PrismaSyncStateRepository },
  ],
  exports: [Ingest],
})
export class IngestModule {}
