import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromPrisma, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { type Env, validateEnv } from './config.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisConnection } from './redis/redis.connection.js';
import { RedisModule } from './redis/redis.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { IngestModule } from './ingest/ingest.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { plugins } from './plugins/enabled.js';
import { PluginsModule } from './plugins/plugins.module.js';

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
    OutboxModule.forRoot({
      relay: { pollInterval: '1s' },
      retry: { attempts: 10, backoff: { delay: '1s', maxDelay: '1m' } },
    }),
    RedisModule,
    BullModule.forRootAsync({
      inject: [RedisConnection],
      useFactory: (connection: RedisConnection) => ({ connection }),
    }),
    ScheduleModule.forRoot(),
    PluginsModule,
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
    ...plugins,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      // outbox messages live in our postgres, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [PrismaService, OutboxStorage],
      useFactory: (prisma: PrismaService, storage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromPrisma(prisma) }, storage),
    },
  ],
})
export class AppModule {}
