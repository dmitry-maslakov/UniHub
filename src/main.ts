import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config.js';
import { grpcOptions } from './ingest/contracts.js';

async function bootstrap() {
  // Better Auth reads raw request bodies; the auth module parses the rest
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // without it nothing closes on SIGTERM: outbox relay, queues, db pools
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // only needed once some external connector has a token. It doesn't inherit
  // the HTTP auth guard: connectors sign in with their tokens
  if (config.get('CONNECTOR_TOKENS', { infer: true })) {
    app.connectMicroservice(
      grpcOptions(config.get('GRPC_URL', { infer: true })),
    );
    await app.startAllMicroservices();
  }
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
