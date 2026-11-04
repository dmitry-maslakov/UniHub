import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from './app.config.js';
import { AppModule } from './app.module.js';
import { appOptions, configureApp } from './app.setup.js';
import { grpcOptions, ingestConfig } from './ingest/contracts.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, appOptions);
  // without it nothing closes on SIGTERM: outbox relay, queues, db pools
  app.enableShutdownHooks();
  // only needed once some external connector has a token. It doesn't inherit
  // the HTTP auth guard: connectors sign in with their tokens
  const ingest = app.get<ConfigType<typeof ingestConfig>>(ingestConfig.KEY);
  if (ingest.tokens.size) app.connectMicroservice(grpcOptions(ingest.grpcUrl));
  await configureApp(app);
  await app.listen(app.get<ConfigType<typeof appConfig>>(appConfig.KEY).port);
}
await bootstrap();
