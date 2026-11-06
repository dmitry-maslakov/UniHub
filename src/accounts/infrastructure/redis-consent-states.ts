import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { PortalId } from '@app/kernel';
import { REDIS } from '../../platform/redis/redis.module.js';
import {
  CONSENT_TTL_SECONDS,
  ConsentStates,
  type PendingConsent,
} from '../application/oauth.js';

const key = (state: string) => `accounts:consent:${state}`;

const Pending = z.object({
  userId: z.string(),
  portal: PortalId,
  verifier: z.string(),
});

// A consent on its way, set to run out in Redis and read with GETDEL, so
// it's taken once whichever instance the callback reaches.
@Injectable()
export class RedisConsentStates extends ConsentStates {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async put(state: string, pending: PendingConsent) {
    await this.redis.set(
      key(state),
      JSON.stringify(pending),
      'EX',
      CONSENT_TTL_SECONDS,
    );
  }

  async take(state: string) {
    const kept = await this.redis.getdel(key(state));
    return kept === null ? null : Pending.parse(JSON.parse(kept));
  }
}
