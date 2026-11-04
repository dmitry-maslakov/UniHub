import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlobStore } from './domain/blob-store.js';
import { FsBlobStore } from './infrastructure/fs-blob-store.js';
import { storageConfig } from './storage.config.js';

// Where file content is kept, for the modules that import it: a technical
// module with one port, no commands or rules of its own.
@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [{ provide: BlobStore, useClass: FsBlobStore }],
  exports: [BlobStore],
})
export class StorageModule {}
