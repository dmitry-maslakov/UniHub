import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import {
  OutboxModule,
  OutboxPublishTimeoutError,
  OutboxStorage,
} from '@nestjs/outbox';
import { fromPrisma, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { type Env, envSchema } from './config.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { REDIS, RedisModule } from './redis/redis.module.js';
import type { Redis } from 'ioredis';
import { CatalogModule } from './catalog/catalog.module.js';
import { IngestModule } from './ingest/ingest.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { BullMqTransport } from './processing/infrastructure/bullmq.transport.js';
import { routeFor } from './processing/outbox-routes.js';
import { isConnectionError } from './redis/is-connection-error.js';
import { plugins } from './plugins/enabled.js';
import { PluginsModule } from './plugins/plugins.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    // Redis and Prisma come before anything that pulls in BullMQ: global
    // modules shut down in reverse order, so they close after the workers
    RedisModule,
    PrismaModule,
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
    BullModule.forRootAsync({
      inject: [REDIS],
      useFactory: (connection: Redis) => ({ connection }),
      extraOptions: { manualRegistration: true },
    }),
    OutboxModule.forRoot({
      transports: { plugins: BullMqTransport },
      imports: [ProcessingModule],
      route: (message) => routeFor(message.topic),
      relay: { pollInterval: '1s' },
      retry: {
        // the attempt limit always applies, so it is set high and retryIf
        // decides: ten tries, or for as long as redis is unreachable (with
        // maxRetriesPerRequest: null that shows up as a publish timeout)
        attempts: 10_000,
        retryIf: (error, attempt) =>
          attempt < 10 ||
          error instanceof OutboxPublishTimeoutError ||
          isConnectionError(error),
        backoff: { delay: '1s', maxDelay: '1m' },
      },
    }),
    ScheduleModule.forRoot(),
    PluginsModule,
    CatalogModule,
    IngestModule,
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        location: resolve(config.get('STORAGE_PATH', { infer: true })),
      }),
    }),
    ProcessingModule,
    ...plugins,
  ],
  providers: [
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
