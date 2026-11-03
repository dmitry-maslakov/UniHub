import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { PutContentHandler } from './application/commands/put-content.handler.js';
import { GetContentHandler } from './application/queries/get-content.handler.js';
import { BlobStore } from './domain/blob-store.js';
import { FsBlobStore } from './infrastructure/fs-blob-store.js';
import {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  type StorageOptions,
} from './storage.module-definition.js';

const DAY = 24 * 60 * 60 * 1000;

@Module({
  providers: [
    {
      provide: FsBlobStore,
      inject: [MODULE_OPTIONS_TOKEN],
      useFactory: ({ location }: StorageOptions) => new FsBlobStore(location),
    },
    { provide: BlobStore, useExisting: FsBlobStore },
    PutContentHandler,
    GetContentHandler,
  ],
})
export class StorageModule
  extends ConfigurableModuleClass
  implements OnModuleInit
{
  constructor(@Inject(FsBlobStore) private readonly blobs: FsBlobStore) {
    super();
  }

  async onModuleInit() {
    await this.blobs.removeStaleTemp(DAY);
  }
}
