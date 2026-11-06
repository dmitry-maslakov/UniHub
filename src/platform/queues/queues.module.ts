import { Inject, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { BullModule, BullRegistrar } from '@nestjs/bullmq';
import type { Meter } from '@opentelemetry/api';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { METER } from '../metrics/metrics.module.js';
import { REDIS } from '../redis/redis.module.js';
import { roleConfig } from '../role/role.config.js';
import { observeQueues } from './queue-metrics.js';

// BullMQ on the app's Redis client (it can't load ioredis by itself in an
// ESM app). Modules register their own queues and workers.
@Module({
  imports: [
    ConfigModule.forFeature(roleConfig),
    DiscoveryModule,
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
    private readonly discovery: DiscoveryService,
    @Inject(roleConfig.KEY)
    private readonly role: ConfigType<typeof roleConfig>,
    @Inject(METER) private readonly meter: Meter,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // Workers are registered by hand, once every module is initialised, so no
  // job runs before the plugins are found; and only in a process that runs
  // the background work: an api one only adds jobs (APP_ROLE). The queues'
  // counts too, so an api process beside the worker doesn't report them
  // again: every queue the modules registered, as Nest's discovery finds
  // them.
  onApplicationBootstrap() {
    if (!this.role.worker) return;
    this.registrar.register();
    const queues = this.discovery
      .getProviders()
      .map(({ instance }) => instance as unknown)
      .filter((instance): instance is Queue => instance instanceof Queue);
    observeQueues(this.meter, queues, this.redis);
  }
}
