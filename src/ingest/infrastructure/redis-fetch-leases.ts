import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../platform/redis/redis.module.js';
import { FetchLeases } from '../domain/fetch-leases.js';

// A lease is a key set only if it isn't there, with an expiry, as Redis
// documents for a lock on one instance (SET NX PX). It's never released:
// once the bytes are the hub's, no run asks for them again.
@Injectable()
export class RedisFetchLeases extends FetchLeases {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async take(key: string, ms: number) {
    const set = await this.redis.set(
      `ingest:fetch:${key}`,
      '1',
      'PX',
      ms,
      'NX',
    );
    return set === 'OK';
  }
}
