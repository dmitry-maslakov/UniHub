import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from './app.config.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ErrorsModule } from './platform/errors/errors.module.js';
import { MessagingModule } from './platform/messaging/messaging.module.js';
import { QueuesModule } from './platform/queues/queues.module.js';
import { RedisModule } from './platform/redis/redis.module.js';
import { AccessModule } from './access/access.module.js';
import { HealthModule } from './health/health.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { IngestModule } from './ingest/ingest.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { PluginsOutboxTransport } from './processing/contracts.js';
import { plugins } from './plugins/enabled.js';
import { PluginsModule } from './plugins/plugins.module.js';

// The modules the hub is made of; each one configures what it owns, its
// settings included (ConfigModule.forFeature).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
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
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    PluginsModule,
    CatalogModule,
    IdentityModule,
    AccessModule,
    HealthModule,
    IngestModule,
    StorageModule,
    ProcessingModule,
    ...plugins,
  ],
})
export class AppModule {}
