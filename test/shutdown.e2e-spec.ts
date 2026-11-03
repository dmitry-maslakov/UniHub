import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  Aggregator,
  PushConnector,
  ITEM_INGESTED,
  type HandlesMessages,
  type Message,
  type PushesFromPortal,
} from '@app/plugin-sdk';
import { AppModule } from '../src/app.module.js';
import { HubIngest } from '../src/ingest/contracts.js';
import { PLUGINS_QUEUE, type PluginJob } from '../src/processing/queues.js';
import { testEnv } from './env.js';

const portal = 'shutdown-test';

@Aggregator({ name: 'slow-feed', topics: [ITEM_INGESTED] })
@Injectable()
class SlowAggregator implements HandlesMessages {
  started = false;

  async handle(message: Message) {
    if (message.payload.portal === portal) this.started = true;
    await sleep(1_500);
  }
}

@PushConnector({ portal: 'shutdown-push' })
@Injectable()
class StoppableConnector implements PushesFromPortal {
  stopped = false;
  start() {}
  stop() {
    this.stopped = true;
  }
}

@Module({ providers: [SlowAggregator, StoppableConnector] })
class ShutdownPluginsModule {}

describe('shutdown', () => {
  it('lets a running job finish and stops connectors', async () => {
    const app = await Test.createTestingModule({
      imports: [AppModule, ShutdownPluginsModule],
    }).compile();
    await app.init();

    await app
      .get(HubIngest)
      .forPortal(portal)
      .item({ externalId: 'p', kind: 'post', raw: {} });
    const slow = app.get(SlowAggregator);
    await vi.waitFor(() => expect(slow.started).toBe(true), {
      timeout: 10_000,
    });
    const push = app.get(StoppableConnector);

    await app.close();

    expect(push.stopped).toBe(true);
    // the job's end was recorded in redis, not left active to run again
    const redis = new Redis(testEnv.REDIS_URL, { maxRetriesPerRequest: null });
    const queue = new Queue<PluginJob>(PLUGINS_QUEUE, { connection: redis });
    const jobs = (await queue.getJobs()).filter(
      (job) =>
        job.data.plugin === 'slow-feed' &&
        job.data.message.payload.portal === portal,
    );
    expect(await Promise.all(jobs.map((job) => job.getState()))).toEqual([
      'completed',
    ]);
    await queue.close();
    await redis.quit();
  }, 30_000);
});
