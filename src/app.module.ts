import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from './app.config.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ErrorsModule } from './platform/errors/errors.module.js';
import { MessagingModule } from './platform/messaging/messaging.module.js';
import { MetricsModule } from './platform/metrics/metrics.module.js';
import { QueuesModule } from './platform/queues/queues.module.js';
import { RedisModule } from './platform/redis/redis.module.js';
import { roleConfig } from './platform/role/role.config.js';
import { ValidationModule } from './platform/validation/validation.module.js';
import { AccessModule } from './access/access.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { HealthModule } from './health/health.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { IngestModule } from './ingest/ingest.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { PluginsOutboxTransport } from './processing/contracts.js';
import { plugins } from './plugins/enabled.js';
import { PluginsModule } from './plugins/plugins.module.js';
import { WebModule } from './web/contracts.js';

// The modules the hub is made of; each one configures what it owns, its
// settings included (ConfigModule.forFeature). Every role loads them all:
// APP_ROLE decides what runs, the workers (QueuesModule), the scheduler
// (below) and the outbox relay (MessagingModule), and main.ts whether a
// server does.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    // global, first, so its port serves until the rest has shut down
    MetricsModule,
    // Redis and the database come before anything that pulls in BullMQ:
    // global modules shut down in reverse order, so they close after the
    // workers
    RedisModule,
    DatabaseModule,
    QueuesModule,
    // outbox messages go to the plugins, as processing's queue jobs
    MessagingModule.forRoot({
      transports: { plugins: PluginsOutboxTransport },
      imports: [ProcessingModule],
    }),
    ErrorsModule,
    ValidationModule,
    CqrsModule.forRoot(),
    // What runs on its own, the crons and what starts once the app is up
    // (@Timeout(0)), runs only with the background work (APP_ROLE)
    ScheduleModule.forRootAsync({
      imports: [ConfigModule.forFeature(roleConfig)],
      inject: [roleConfig.KEY],
      useFactory: ({ worker }: ConfigType<typeof roleConfig>) => ({
        cronJobs: worker,
        intervals: worker,
        timeouts: worker,
      }),
    }),
    PluginsModule,
    CatalogModule,
    IdentityModule,
    AccessModule,
    AccountsModule,
    HealthModule,
    IngestModule,
    StorageModule,
    ProcessingModule,
    WebModule,
    ...plugins,
  ],
})
export class AppModule {}
