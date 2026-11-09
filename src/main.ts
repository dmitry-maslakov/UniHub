import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { appConfig } from './app.config.js';
import { AppModule } from './app.module.js';
import { appOptions, configureApp } from './app.setup.js';
import { redisConfig } from './platform/redis/redis.config.js';
import { roleConfig } from './platform/role/role.config.js';
import { InstanceAdoption } from './plugins/contracts.js';
import {
  exitCodeFor,
  MODELS_QUEUE,
  ModelsWorker,
  pendingJobs,
} from './processing/contracts.js';

// npm run instances:adopt: what a worker does first as it starts, giving
// rows from before portals' sites were told apart theirs (README, Canvas),
// and nothing else; with APP_ROLE=api, so nothing else runs meanwhile
const ADOPT_INSTANCES = 'adopt-instances';

// npm run models:pending: prints how many jobs the heavy processors' queue
// has to do and exits 0 when there are some, 3 when there are none, so a
// CronJob starts a model only when it's needed. Plain BullMQ on Redis, not
// the app: nothing heavy loads, and nothing is run.
const MODELS_PENDING = 'models-pending';

async function modelsPending() {
  // fail fast: only a BullMQ Worker needs endless retries
  const connection = new Redis(redisConfig().url, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 3_000,
  });
  const queue = new Queue(MODELS_QUEUE, { connection });
  try {
    const pending = await pendingJobs(queue);
    console.log(pending);
    process.exitCode = exitCodeFor(pending);
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

async function bootstrap() {
  // APP_ROLE may come from .env, which ConfigModule loads
  await ConfigModule.envVariablesLoaded;
  if (process.argv[2] === MODELS_PENDING) return modelsPending();
  if (process.argv[2] === ADOPT_INSTANCES) {
    const app = await NestFactory.createApplicationContext(AppModule);
    await app.get(InstanceAdoption).done();
    await app.close();
    return;
  }
  // either way with shutdown hooks: without them nothing closes on SIGTERM
  // (workers, outbox relay, db pools)
  if (roleConfig().models) {
    // the batch run: drains the heavy processors' queue and exits
    const run = await NestFactory.createApplicationContext(AppModule);
    run.enableShutdownHooks();
    Logger.log('models run started, serving no HTTP or gRPC', 'Models');
    if (await run.get(ModelsWorker).drained()) {
      Logger.log('the queue is drained', 'Models');
      await run.close();
      process.exit(0);
    }
    return;
  }
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
