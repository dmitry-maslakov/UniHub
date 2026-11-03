import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config.js';

export const REDIS = Symbol('REDIS');

// BullMQ can't load ioredis by itself in an ESM app, it gets a ready client.
// Global and first in the app's imports, so it shuts down after the queues.
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        // BullMQ workers need maxRetriesPerRequest: null
        new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // quit waits for redis; when it's down that would hang shutdown forever
  async onApplicationShutdown() {
    const timeout = new Promise((resolve) =>
      setTimeout(resolve, 5_000).unref(),
    );
    await Promise.race([this.redis.quit().catch(() => {}), timeout]);
    this.redis.disconnect();
  }
}
