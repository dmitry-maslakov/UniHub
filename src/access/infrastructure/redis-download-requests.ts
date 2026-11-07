import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../platform/redis/redis.module.js';
import {
  DownloadRequests,
  type DownloadRequest,
} from '../domain/download-requests.js';

// ten minutes: long enough for a browser to retry the link
const KEPT_MS = 600_000;

// A request is a key holding it as JSON, set with an expiry (SET PX) and
// never released: it's read again by a retry, then runs out. Its id is 128
// random bits, so the link is the user's alone to guess (and the request
// names the user, too).
@Injectable()
export class RedisDownloadRequests extends DownloadRequests {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async put(request: DownloadRequest) {
    const id = randomBytes(16).toString('base64url');
    await this.redis.set(
      `access:download:${id}`,
      JSON.stringify(request),
      'PX',
      KEPT_MS,
    );
    return id;
  }

  async get(id: string) {
    const kept = await this.redis.get(`access:download:${id}`);
    return kept === null ? null : (JSON.parse(kept) as DownloadRequest);
  }
}
