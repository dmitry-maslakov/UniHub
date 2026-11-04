import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, BullRegistrar } from '@nestjs/bullmq';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

// BullMQ on the app's Redis client (it can't load ioredis by itself in an
// ESM app). Modules register their own queues and workers.
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [REDIS],
      useFactory: (connection: Redis) => ({ connection }),
      extraOptions: { manualRegistration: true },
    }),
  ],
})
export class QueuesModule implements OnApplicationBootstrap {
  constructor(private readonly registrar: BullRegistrar) {}

  // Workers are registered by hand, once every module is initialised, so no
  // job runs before the plugins are found.
  onApplicationBootstrap() {
    this.registrar.register();
  }
}
