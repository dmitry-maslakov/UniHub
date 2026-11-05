import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { appConfig } from './app.config.js';
import { AppModule } from './app.module.js';
import { appOptions, configureApp } from './app.setup.js';
import { roleConfig } from './platform/role/role.config.js';

async function bootstrap() {
  // APP_ROLE may come from .env, which ConfigModule loads
  await ConfigModule.envVariablesLoaded;
  // either way with shutdown hooks: without them nothing closes on SIGTERM
  // (workers, outbox relay, db pools)
  if (!roleConfig().api) {
    // the worker: a standalone app, with no HTTP or gRPC server
    const worker = await NestFactory.createApplicationContext(AppModule);
    worker.enableShutdownHooks();
    Logger.log('worker started, serving no HTTP or gRPC', 'Worker');
    return;
  }
  const app = await NestFactory.create(AppModule, appOptions);
  app.enableShutdownHooks();
  await configureApp(app);
  await app.listen(app.get<ConfigType<typeof appConfig>>(appConfig.KEY).port);
}
await bootstrap();
