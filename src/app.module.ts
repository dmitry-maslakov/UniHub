import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { type Env, validateEnv } from './config.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { IngestModule } from './ingest/ingest.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ProcessingModule } from './processing/processing.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    CqrsModule.forRoot(),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaService,
          }),
        }),
      ],
    }),
    PrismaModule,
    CatalogModule,
    IngestModule,
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        driver: 'fs',
        location: resolve(config.get('STORAGE_PATH', { infer: true })),
      }),
    }),
    ProcessingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
