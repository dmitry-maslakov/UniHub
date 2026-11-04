import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { PutContentHandler } from './application/commands/put-content.handler.js';
import { GetContentHandler } from './application/queries/get-content.handler.js';
import { BlobStore } from './domain/blob-store.js';
import { FsBlobStore } from './infrastructure/fs-blob-store.js';
import { storageConfig } from './storage.config.js';

const DAY = 24 * 60 * 60 * 1000;

@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [
    {
      provide: FsBlobStore,
      inject: [storageConfig.KEY],
      useFactory: ({ location }: ConfigType<typeof storageConfig>) =>
        new FsBlobStore(location),
    },
    { provide: BlobStore, useExisting: FsBlobStore },
    PutContentHandler,
    GetContentHandler,
  ],
})
export class StorageModule implements OnModuleInit {
  constructor(@Inject(FsBlobStore) private readonly blobs: FsBlobStore) {}

  async onModuleInit() {
    await this.blobs.removeStaleTemp(DAY);
  }
}
