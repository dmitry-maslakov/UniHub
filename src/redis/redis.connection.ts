import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config.js';

// BullMQ can't load ioredis by itself in an ESM app, it needs a ready client
@Injectable()
export class RedisConnection extends Redis implements OnApplicationShutdown {
  constructor(config: ConfigService<Env, true>) {
    // BullMQ workers need maxRetriesPerRequest: null
    super(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
  }

  async onApplicationShutdown() {
    await this.quit();
  }
}
