import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../platform/redis/redis.module.js';
import { FetchLeases } from '../domain/fetch-leases.js';

// as long as a run may take by default (CONNECTOR_POLL_TIMEOUT_MINUTES):
// the run that took it downloads after its listing, in the same run
export const LEASE_MS = 60 * 60_000;

// A lease is a key set only if it isn't there, with an expiry, as Redis
// documents for a lock on one instance (SET NX PX). It's never released:
// once the bytes are the hub's, no run asks for them again.
@Injectable()
export class RedisFetchLeases extends FetchLeases {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async take(key: string) {
    const set = await this.redis.set(
      `ingest:fetch:${key}`,
      '1',
      'PX',
      LEASE_MS,
      'NX',
    );
    return set === 'OK';
  }
}
