import { Inject, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { BullModule, BullRegistrar } from '@nestjs/bullmq';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { roleConfig } from '../role/role.config.js';

// BullMQ on the app's Redis client (it can't load ioredis by itself in an
// ESM app). Modules register their own queues and workers.
@Module({
  imports: [
    ConfigModule.forFeature(roleConfig),
    BullModule.forRootAsync({
      inject: [REDIS],
      useFactory: (connection: Redis) => ({ connection }),
      extraOptions: { manualRegistration: true },
    }),
  ],
})
export class QueuesModule implements OnApplicationBootstrap {
  constructor(
    private readonly registrar: BullRegistrar,
    @Inject(roleConfig.KEY)
    private readonly role: ConfigType<typeof roleConfig>,
  ) {}

  // Workers are registered by hand, once every module is initialised, so no
  // job runs before the plugins are found; and only in a process that runs
  // the background work: an api one only adds jobs (APP_ROLE).
  onApplicationBootstrap() {
    if (this.role.worker) this.registrar.register();
  }
}
