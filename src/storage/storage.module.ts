import { Module } from '@nestjs/common';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { GetContentHandler } from './application/queries/get-content.handler.js';
import { PutContentHandler } from './application/commands/put-content.handler.js';
import { BlobStore } from './domain/blob-store.js';
import { DiskBlobStore } from './infrastructure/disk-blob-store.js';
import {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  type StorageOptions,
} from './storage.module-definition.js';

@Module({
  providers: [
    {
      provide: BlobStore,
      inject: [MODULE_OPTIONS_TOKEN],
      useFactory: ({ location }: StorageOptions) =>
        new DiskBlobStore(
          new Disk(new FSDriver({ location, visibility: 'private' })),
        ),
    },
    PutContentHandler,
    GetContentHandler,
  ],
})
export class StorageModule extends ConfigurableModuleClass {}
