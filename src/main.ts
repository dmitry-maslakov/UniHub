import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from './app.config.js';
import { AppModule } from './app.module.js';
import { appOptions, configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, appOptions);
  // without it nothing closes on SIGTERM: outbox relay, queues, db pools
  app.enableShutdownHooks();
  await configureApp(app);
  await app.listen(app.get<ConfigType<typeof appConfig>>(appConfig.KEY).port);
}
await bootstrap();
